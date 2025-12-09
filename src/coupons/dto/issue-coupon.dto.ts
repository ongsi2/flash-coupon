import {IsNotEmpty, IsUUID} from "class-validator";

export class IssueCouponDto {
    @IsUUID()
    @IsNotEmpty()
    userId: string;
}
