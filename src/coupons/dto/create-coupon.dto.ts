import {IsDateString, IsIn, IsInt, IsNotEmpty, IsString, Min} from "class-validator";
import type {CouponType, DiscountType} from "../coupon.entity";
import {IsDateRangeValid} from "../../common/validators/date-range.validator";

export class CreateCouponDto {

    @IsString()
    @IsNotEmpty()
    name: string;

    @IsIn(['FCFS', 'LOTTERY', 'CODE'])
    type: CouponType;

    @IsIn(['RATE', 'AMOUNT'])
    discountType: DiscountType;

    @IsInt()
    @Min(1)
    discountValue: number;

    @IsInt()
    @Min(1)
    totalQuantity: number;

    @IsDateString()
    startAt: string;

    @IsDateRangeValid()
    @IsDateString()
    endAt: string;



}