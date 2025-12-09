import {IsIn, IsInt, IsNotEmpty, IsOptional, IsUUID, Max, Min} from "class-validator";
import {Type} from "class-transformer";
import {IssuedCouponStatus} from "../entities/issued-coupon.entity";

export class GetMyCouponsQueryDto {
    @IsUUID()
    @IsNotEmpty()
    userId: string;

    @IsOptional()
    @IsIn(['ISSUED', 'USED', 'EXPIRED'])
    status?: IssuedCouponStatus;

    @IsOptional()
    @IsInt()
    @Min(1)
    @Type(() => Number)
    page?: number = 1;

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(100)
    @Type(() => Number)
    limit?: number = 20;
}
