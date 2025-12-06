import { Module } from '@nestjs/common';
import { CouponsService } from './coupons.service';
import { CouponsController } from './coupons.controller';
import {TypeOrmModule} from "@nestjs/typeorm";
import {Coupon} from "./coupon.entity";
import {RedisModule} from "../redis/redis.module";

@Module({
    imports: [TypeOrmModule.forFeature([Coupon]),
              RedisModule,
    ],
    providers: [CouponsService],
    controllers: [CouponsController],
    exports: [CouponsService],
})
export class CouponsModule {}
