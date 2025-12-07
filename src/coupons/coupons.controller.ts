import {Body, Controller, Get, Param, Post, Patch, ParseIntPipe} from '@nestjs/common';
import {CouponsService} from "./coupons.service";
import {CreateCouponDto} from "./dto/create-coupon.dto";
import {Coupon} from "./coupon.entity";
import {UpdateCouponDto} from "./dto/update-coupon.dto";

@Controller('api/admin/coupons')
export class CouponsController {
    constructor(private readonly couponsService: CouponsService) {
    }

    @Post()
    create(@Body() dto: CreateCouponDto): Promise<Coupon> {
        return this.couponsService.create(dto);
    }

    @Get()
    findOne(@Param('id') id: string): Promise<Coupon> {
        return this.couponsService.findOne(id);
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
        @Body('userId') userId: string,
    ){
        const result = await this.couponsService.issueCoupon(id, userId);

        return {
            couponId: id,
            userId,
            status: result.status,
            remaining: result.remaining ?? null,
        };
    }

}
