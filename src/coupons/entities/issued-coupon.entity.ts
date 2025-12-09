import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
    UpdateDateColumn
} from "typeorm";
import {Coupon} from "../coupon.entity";
import {User} from "../../users/user.entity";

export enum IssuedCouponStatus {
    ISSUED = 'ISSUED',
    USED = 'USED',
    EXPIRED = 'EXPIRED'
}

@Entity({ name: 'issued_coupons' })
@Index(['userId', 'status'])
@Index(['couponId', 'status'])
@Index(['userId', 'couponId'], { unique: true })
export class IssuedCoupon {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'uuid', name: 'coupon_id' })
    couponId: string;

    @Column({ type: 'uuid', name: 'user_id' })
    userId: string;

    @Column({ type: 'varchar', length: 20, default: IssuedCouponStatus.ISSUED })
    status: IssuedCouponStatus;

    @Column({ type: 'timestamp', name: 'issued_at' })
    issuedAt: Date;

    @Column({ type: 'timestamp', name: 'used_at', nullable: true })
    usedAt: Date | null;

    @Column({ type: 'timestamp', name: 'expires_at' })
    expiresAt: Date;

    @ManyToOne(() => Coupon, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'coupon_id' })
    coupon: Coupon;

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    user: User;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
