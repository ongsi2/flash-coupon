import {Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn} from "typeorm";
import {IssuedCoupon} from "../coupons/entities/issued-coupon.entity";

@Entity({ name: 'users'})
export class User {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({length: 100, unique: true})
    email: string;

    @Column({length: 50})
    name: string;

    //todo : 추후 추가
    // @Column({length: 50})
    // password: string;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;

    @OneToMany(() => IssuedCoupon, (issued) => issued.user)
    issuedCoupons: IssuedCoupon[];
}