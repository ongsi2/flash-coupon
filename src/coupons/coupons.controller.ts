import {Body, Controller, Get, Param, Post, Patch} from '@nestjs/common';
import {CouponsService} from "./coupons.service";
import {CreateCouponDto} from "./dto/create-coupon.dto";
import {Coupon} from "./coupon.entity";
import {UpdateCouponDto} from "./dto/update-coupon.dto";
import {IssueCouponDto} from "./dto/issue-coupon.dto";
import {CouponWithStatsDto} from "./dto/coupon-with-stats.dto";

@Controller('api/admin/coupons')
export class CouponsController {
    constructor(private readonly couponsService: CouponsService) {
    }

    @Post()
    create(@Body() dto: CreateCouponDto): Promise<Coupon> {
        return this.couponsService.create(dto);
    }

    @Get()
    findAll(): Promise<CouponWithStatsDto[]> {
        return this.couponsService.findAllWithStats();
    }

    @Get(':id')
    findOne(@Param('id') id: string): Promise<CouponWithStatsDto> {
        return this.couponsService.findOneWithStats(id);
    }

    @Patch(':id')
    update(
        @Param('id') id: string,
        @Body() dto: UpdateCouponDto,
    ): Promise<Coupon> {
        return this.couponsService.update(id, dto);
    }

    @Post(':id/issue')
    async issueCoupon(
        @Param('id') id: string,
        @Body() dto: IssueCouponDto,
    ){
        const result = await this.couponsService.issueCoupon(id, dto.userId);

        return {
            couponId: id,
            userId: dto.userId,
            status: result.status,
            remaining: result.remaining ?? null,
        };
    }

}
