import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { IssuedCouponsService } from '../services/issued-coupons.service';
import { GetMyCouponsQueryDto } from '../dto/get-my-coupons-query.dto';
import { UseCouponDto } from '../dto/use-coupon.dto';

@Controller('api/user/coupons')
export class UserCouponsController {
    constructor(
        private readonly issuedCouponsService: IssuedCouponsService,
    ) {}

    @Get('my-coupons')
    async getMyCoupons(
        @Query() queryDto: GetMyCouponsQueryDto,
    ) {
        const result = await this.issuedCouponsService.findUserCoupons(
            queryDto.userId,
            queryDto,
        );

        return {
            data: result.data.map((issued) => ({
                id: issued.id,
                couponId: issued.couponId,
                couponName: issued.coupon.name,
                discountType: issued.coupon.discountType,
                discountValue: issued.coupon.discountValue,
                status: issued.status,
                issuedAt: issued.issuedAt,
                usedAt: issued.usedAt,
                expiresAt: issued.expiresAt,
                isExpired: new Date() > issued.expiresAt,
            })),
            meta: result.meta,
        };
    }

    @Post(':issuedCouponId/use')
    async useCoupon(
        @Param('issuedCouponId') issuedCouponId: string,
        @Body() dto: UseCouponDto,
    ) {
        const issued = await this.issuedCouponsService.useCoupon(
            issuedCouponId,
            dto.userId,
        );

        return {
            success: true,
            message: '쿠폰이 정상 사용 처리되었습니다.',
            data: {
                id: issued.id,
                status: issued.status,
                usedAt: issued.usedAt,
            },
        };
    }
}
