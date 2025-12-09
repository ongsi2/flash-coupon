import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException
} from '@nestjs/common';
import {InjectRepository} from "@nestjs/typeorm";
import {Repository} from "typeorm";
import {IssuedCoupon, IssuedCouponStatus} from "../entities/issued-coupon.entity";
import {GetMyCouponsQueryDto} from "../dto/get-my-coupons-query.dto";
import {CouponStats} from "../dto/coupon-with-stats.dto";

export interface PaginationMeta {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

@Injectable()
export class IssuedCouponsService {
    constructor(
        @InjectRepository(IssuedCoupon)
        private readonly issuedCouponRepo: Repository<IssuedCoupon>,
    ) {}

    // 발급 내역 저장
    async createIssuedCoupon(
        couponId: string,
        userId: string,
        expiresAt: Date
    ): Promise<IssuedCoupon> {
        const issued = this.issuedCouponRepo.create({
            couponId,
            userId,
            status: IssuedCouponStatus.ISSUED,
            issuedAt: new Date(),
            expiresAt,
        });

        try {
            return await this.issuedCouponRepo.save(issued);
        } catch (error: any) {
            // PostgreSQL unique constraint violation
            if (error.code === '23505') {
                throw new ConflictException('이미 발급된 쿠폰입니다');
            }
            throw error;
        }
    }

    // 사용자 쿠폰 목록 조회 (페이징)
    async findUserCoupons(
        userId: string,
        queryDto: GetMyCouponsQueryDto
    ): Promise<{ data: IssuedCoupon[]; meta: PaginationMeta }> {
        const { status, page = 1, limit = 20 } = queryDto;

        const qb = this.issuedCouponRepo
            .createQueryBuilder('ic')
            .leftJoinAndSelect('ic.coupon', 'coupon')
            .where('ic.userId = :userId', { userId });

        if (status) {
            qb.andWhere('ic.status = :status', { status });
        }

        const [data, total] = await qb
            .orderBy('ic.issuedAt', 'DESC')
            .skip((page - 1) * limit)
            .take(limit)
            .getManyAndCount();

        return {
            data,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        };
    }

    // 쿠폰 사용 처리
    async useCoupon(
        issuedCouponId: string,
        userId: string
    ): Promise<IssuedCoupon> {
        const issued = await this.issuedCouponRepo.findOne({
            where: { id: issuedCouponId },
            relations: ['coupon']
        });

        if (!issued) {
            throw new NotFoundException('발급된 쿠폰을 찾을 수 없습니다');
        }

        if (issued.userId !== userId) {
            throw new ForbiddenException('본인의 쿠폰만 사용할 수 있습니다');
        }

        if (issued.status === IssuedCouponStatus.USED) {
            throw new BadRequestException('이미 사용된 쿠폰입니다');
        }

        if (issued.status === IssuedCouponStatus.EXPIRED || new Date() > issued.expiresAt) {
            throw new BadRequestException('만료된 쿠폰입니다');
        }

        issued.status = IssuedCouponStatus.USED;
        issued.usedAt = new Date();

        return this.issuedCouponRepo.save(issued);
    }

    // 쿠폰 통계
    async getCouponStats(couponId: string): Promise<CouponStats> {
        const stats = await this.issuedCouponRepo
            .createQueryBuilder('ic')
            .select('ic.status', 'status')
            .addSelect('COUNT(*)', 'count')
            .where('ic.couponId = :couponId', { couponId })
            .groupBy('ic.status')
            .getRawMany();

        return {
            issuedCount: Number(stats.find(s => s.status === 'ISSUED')?.count || 0),
            usedCount: Number(stats.find(s => s.status === 'USED')?.count || 0),
            expiredCount: Number(stats.find(s => s.status === 'EXPIRED')?.count || 0),
            remainingCount: 0, // Redis에서 조회하므로 여기서는 0으로 설정
        };
    }
}
