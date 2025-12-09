import {Injectable, NotFoundException} from '@nestjs/common';
import {Repository} from "typeorm";
import {InjectRepository} from "@nestjs/typeorm";
import {Coupon} from "./coupon.entity";
import {CreateCouponDto} from "./dto/create-coupon.dto";
import {UpdateCouponDto} from "./dto/update-coupon.dto";
import {RedisService} from "../redis/redis.service";
import {IssuedCouponsService} from "./services/issued-coupons.service";
import {UsersService} from "../users/users.service";
import {CouponWithStatsDto} from "./dto/coupon-with-stats.dto";

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
    ){}

    async create(createDto: CreateCouponDto): Promise<Coupon> {
        const coupon = this.couponRepository.create({
            ...createDto,
            startAt: new Date(createDto.startAt),
            endAt: new Date(createDto.endAt),
            issuedQuantity: 0,
            });

        const saved = await this.couponRepository.save(coupon);

        const redis = this.redisService.getClient();
        await redis.set(`coupon:${saved.id}:remaining`, saved.totalQuantity)

        return saved;
    }

    findAll(): Promise<Coupon[]> {
        return this.couponRepository.find({
            order: {createdAt: 'DESC'}
        })
    }

    async findOne(id: string): Promise<Coupon> {
        const coupon = await this.couponRepository.findOne({where: {id}});
        if (!coupon) {
            throw new NotFoundException(`쿠폰을 찾을 수 없습니다.`);
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
        return this.couponRepository.save(merged);
    }

    async remove(id: string): Promise<void> {
        const result = await this.couponRepository.delete(id);
        if (result.affected === 0) {
            throw new NotFoundException("쿠폰을 찾을 수 없습니다.")
        }
    }

    async issueCoupon(couponId: string, userId: string): Promise<IssueResult> {
        // 1. 쿠폰 존재 확인
        const coupon = await this.findOne(couponId);

        // 2. 사용자 존재 확인
        const user = await this.usersService.findOne(userId);
        if (!user) {
            throw new NotFoundException('사용자를 찾을 수 없습니다');
        }

        // 3. 기간 검증
        const now = new Date();
        if (now < coupon.startAt) {
            return { status: 'NOT_STARTED' };
        }
        if (now > coupon.endAt) {
            return { status: 'EXPIRED' };
        }

        // 4. Redis 원자적 발급
        const result = await this.redisService.issueCouponWithLua(couponId, userId);

        if (result === -1) return {status: 'DUPLICATED'};
        if (result === 0) return {status: 'SOLD_OUT'};

        // 5. DB 저장 (비동기, 실패해도 Redis는 성공으로 처리)
        this.issuedCouponsService.createIssuedCoupon(
            couponId,
            userId,
            coupon.endAt
        ).catch(error => {
            console.error('[ERROR] Failed to persist issued coupon:', error);
        });

        return { status: 'SUCCESS', remaining: result};
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
                    }
                };
            })
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
            }
        };
    }
}
