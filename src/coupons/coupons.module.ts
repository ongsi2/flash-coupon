import { Module } from '@nestjs/common';
import { CouponsService } from './coupons.service';
import { CouponsController } from './coupons.controller';
import {TypeOrmModule} from "@nestjs/typeorm";
import {Coupon} from "./coupon.entity";
import {RedisModule} from "../redis/redis.module";
import {IssuedCoupon} from "./entities/issued-coupon.entity";
import {IssuedCouponsService} from "./services/issued-coupons.service";
import {UserCouponsController} from "./controllers/user-coupons.controller";
import {UsersModule} from "../users/users.module";

@Module({
    imports: [
        TypeOrmModule.forFeature([Coupon, IssuedCoupon]),
        RedisModule,
        UsersModule,
    ],
    providers: [
        CouponsService,
        IssuedCouponsService,
    ],
    controllers: [
        CouponsController,
        UserCouponsController,
    ],
    exports: [CouponsService],
})
export class CouponsModule {}
