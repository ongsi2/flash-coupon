import {IsNotEmpty, IsUUID} from "class-validator";

export class UseCouponDto {
    @IsUUID()
    @IsNotEmpty()
    userId: string;
}
