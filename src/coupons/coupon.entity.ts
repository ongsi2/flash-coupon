import {Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn} from "typeorm";


export type CouponType = 'FCFS' | 'LOTTERY' | 'CODE';
export type DiscountType = 'RATE' | 'AMOUNT';


@Entity({name: 'coupons'})
export class Coupon {

    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({length: 100})
    name: string;

    @Column({type: 'varchar', length: 20})
    type: CouponType;

    @Column({type: 'varchar', length: 20})
    discountType: DiscountType;

    @Column({type: 'int'})
    discountValue: number;

    @Column({type: 'int'})
    totalQuantity: number;

    @Column({type: 'int', default: 0})
    issuedQuantity: number;

    @Column({type: 'timestamp'})
    startAt: Date;

    @Column({type: 'timestamp'})
    endAt: Date;

    @CreateDateColumn({name: 'created_at'})
    createdAt: Date;

    @UpdateDateColumn({name: 'updated_at'})
    updateAt: Date;

}