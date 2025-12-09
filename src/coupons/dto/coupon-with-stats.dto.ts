import {Coupon} from "../coupon.entity";

export interface CouponStats {
    issuedCount: number;
    usedCount: number;
    remainingCount: number;
    expiredCount: number;
}

export class CouponWithStatsDto extends Coupon {
    stats: CouponStats;
}
