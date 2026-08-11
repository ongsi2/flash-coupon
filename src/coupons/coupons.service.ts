import { Injectable, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Coupon } from './coupon.entity';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { UpdateCouponDto } from './dto/update-coupon.dto';
import { RedisService } from '../redis/redis.service';
import { IssuedCouponsService } from './services/issued-coupons.service';
import { UsersService } from '../users/users.service';
import { CouponWithStatsDto } from './dto/coupon-with-stats.dto';
import { metaKeyOf } from '../redis/issue-coupon.script';

export type IssueResultStatus = 'SUCCESS' | 'DUPLICATED' | 'SOLD_OUT' | 'EXPIRED' | 'NOT_STARTED';

export interface IssueResult {
    status: IssueResultStatus;
    remaining?: number;
}

@Injectable()
export class CouponsService {
    constructor(
        @InjectRepository(Coupon)
        private readonly couponRepository: Repository<Coupon>,
        private readonly redisService: RedisService,
        private readonly issuedCouponsService: IssuedCouponsService,
        private readonly usersService: UsersService,
    ) {}

    async create(createDto: CreateCouponDto): Promise<Coupon> {
        const coupon = this.couponRepository.create({
            ...createDto,
            startAt: new Date(createDto.startAt),
            endAt: new Date(createDto.endAt),
            issuedQuantity: 0,
        });

        const saved = await this.couponRepository.save(coupon);

        const redis = this.redisService.getClient();
        await redis.set(`coupon:${saved.id}:remaining`, saved.totalQuantity);
        await this.cacheIssuePeriod(saved);

        return saved;
    }

    findAll(): Promise<Coupon[]> {
        return this.couponRepository.find({
            order: { createdAt: 'DESC' },
        });
    }

    async findOne(id: string): Promise<Coupon> {
        const coupon = await this.couponRepository.findOne({ where: { id } });
        if (!coupon) {
            throw new NotFoundException('쿠폰을 찾을 수 없습니다.');
        }

        return coupon;
    }

    async update(id: string, updateDto: UpdateCouponDto): Promise<Coupon> {
        const coupon = await this.findOne(id);

        if (updateDto.startAt) {
            (updateDto as any).startAt = new Date(updateDto.startAt);
        }
        if (updateDto.endAt) {
            (updateDto as any).endAt = new Date(updateDto.endAt);
        }

        const merged = this.couponRepository.merge(coupon, updateDto);
        const saved = await this.couponRepository.save(merged);

        // 기간이 바뀌었을 수 있으므로 캐시를 갱신한다.
        // 빠뜨리면 발급 경로가 옛 기간으로 판정한다.
        await this.cacheIssuePeriod(saved);

        return saved;
    }

    async remove(id: string): Promise<void> {
        const result = await this.couponRepository.delete(id);
        if (result.affected === 0) {
            throw new NotFoundException('쿠폰을 찾을 수 없습니다.');
        }
        await this.redisService.getClient().del(metaKeyOf(id));
    }

    /**
     * 발급 기간을 Redis 캐시에서 읽는다. 없으면 DB에서 읽어 채운다.
     *
     * 발급 경로는 원래 매 요청마다 쿠폰과 사용자를 각각 SELECT한 뒤에야
     * Redis에 닿았다. 부하 시 이 왕복이 꼬리 지연의 주된 원인이었다.
     * 발급 기간은 거의 바뀌지 않으므로 캐시하기에 적합하다.
     */
    private async getIssuePeriod(couponId: string): Promise<{ startAt: Date; endAt: Date }> {
        const redis = this.redisService.getClient();
        const cached = await redis.get(metaKeyOf(couponId));

        if (cached) {
            const meta = JSON.parse(cached);
            return { startAt: new Date(meta.startAt), endAt: new Date(meta.endAt) };
        }

        const coupon = await this.findOne(couponId); // 캐시 미스일 때만 DB
        await this.cacheIssuePeriod(coupon);
        return { startAt: coupon.startAt, endAt: coupon.endAt };
    }

    /** 발급 기간 캐시를 갱신한다. 쿠폰 생성/수정/동기화 시 호출한다. */
    private async cacheIssuePeriod(coupon: Coupon): Promise<void> {
        await this.redisService
            .getClient()
            .set(
                metaKeyOf(coupon.id),
                JSON.stringify({ startAt: coupon.startAt, endAt: coupon.endAt }),
            );
    }

    async issueCoupon(couponId: string, userId: string): Promise<IssueResult> {
        // 1. 발급 기간 확인 (캐시 적중 시 DB 왕복 없음)
        const { startAt, endAt } = await this.getIssuePeriod(couponId);

        // 2. 사용자 존재 여부 확인
        const user = await this.usersService.findOne(userId);
        if (!user) {
            throw new NotFoundException('사용자를 찾을 수 없습니다.');
        }

        // 3. 기간 검사
        const now = new Date();
        if (now < startAt) {
            return { status: 'NOT_STARTED' };
        }
        if (now > endAt) {
            return { status: 'EXPIRED' };
        }

        // 4. Redis Lua 스크립트로 발급 시도
        const { code, remaining } = await this.redisService.issueCouponWithLua(couponId, userId);

        if (code === -1) return { status: 'DUPLICATED' };
        if (code === 0) return { status: 'SOLD_OUT' };

        // 5. DB 기록(비동기) — Redis 성공 기준으로 처리
        this.issuedCouponsService
            .createIssuedCoupon(couponId, userId, endAt)
            .catch((error) => {
                console.error('[ERROR] Failed to persist issued coupon:', error);
            });

        return { status: 'SUCCESS', remaining };
    }

    async findAllWithStats(): Promise<CouponWithStatsDto[]> {
        const coupons = await this.findAll();
        const redis = this.redisService.getClient();

        return Promise.all(
            coupons.map(async (coupon) => {
                const stats = await this.issuedCouponsService.getCouponStats(coupon.id);
                const remaining = await redis.get(`coupon:${coupon.id}:remaining`);

                return {
                    ...coupon,
                    stats: {
                        ...stats,
                        remainingCount: parseInt(remaining || '0', 10),
                    },
                };
            }),
        );
    }

    async findOneWithStats(id: string): Promise<CouponWithStatsDto> {
        const coupon = await this.findOne(id);
        const stats = await this.issuedCouponsService.getCouponStats(id);
        const redis = this.redisService.getClient();
        const remaining = await redis.get(`coupon:${id}:remaining`);

        return {
            ...coupon,
            stats: {
                ...stats,
                remainingCount: parseInt(remaining || '0', 10),
            },
        };
    }

    async syncRedisFromDatabase(): Promise<{ message: string; synced: number }> {
        const coupons = await this.findAll();
        const redis = this.redisService.getClient();
        let synced = 0;

        for (const coupon of coupons) {
            const stats = await this.issuedCouponsService.getCouponStats(coupon.id);
            const remaining = coupon.totalQuantity - stats.issuedCount;

            await redis.set(`coupon:${coupon.id}:remaining`, Math.max(0, remaining));
            await this.cacheIssuePeriod(coupon);
            synced++;
        }

        return {
            message: `Successfully synced ${synced} coupons from database to Redis`,
            synced,
        };
    }
}
