import {Injectable, NotFoundException} from '@nestjs/common';
import {Repository} from "typeorm";
import {InjectRepository} from "@nestjs/typeorm";
import {Coupon} from "./coupon.entity";
import {CreateCouponDto} from "./dto/create-coupon.dto";
import {UpdateCouponDto} from "./dto/update-coupon.dto";
import {RedisService} from "../redis/redis.service";

export type IssueResultStatus = 'SUCCESS' | 'DUPLICATED' | 'SOLD_OUT';

export interface IssueResult {
    status: IssueResultStatus;
    remaining?: number;
}

@Injectable()
export class CouponsService {

    constructor(
        @InjectRepository(Coupon)
        private readonly couponRepository: Repository<Coupon>,
        private readonly redisService: RedisService,
    ){}

    async create(createDto: CreateCouponDto): Promise<Coupon> {
        const coupon = this.couponRepository.create({
            ...createDto,
            startAt: new Date(createDto.startAt),
            endAt: new Date(createDto.endAt),
            issuedQuantity: 0,
            });

        const saved = await this.couponRepository.save(coupon);

        const redis = this.redisService.getClient();
        await redis.set(`coupon:${saved.id}:remaining`, saved.totalQuantity)

        return saved;
    }

    findAll(): Promise<Coupon[]> {
        return this.couponRepository.find({
            order: {createdAt: 'DESC'}
        })
    }

    async findOne(id: string): Promise<Coupon> {
        const coupon = await this.couponRepository.findOne({where: {id}});
        if (!coupon) {
            throw new NotFoundException(`쿠폰을 찾을 수 없습니다.`);
        }

        return coupon;
    }

    async update(id: string, updateDto: UpdateCouponDto): Promise<Coupon> {
        const coupon = await this.findOne(id);

        if (updateDto.startAt) {
            (updateDto as any).startAt = new Date(updateDto.startAt);
        }
        if (updateDto.endAt) {
            (updateDto as any).endAt = new Date(updateDto.endAt);
        }

        const merged = this.couponRepository.merge(coupon, updateDto);
        return this.couponRepository.save(merged);
    }

    async remove(id: string): Promise<void> {
        const result = await this.couponRepository.delete(id);
        if (result.affected === 0) {
            throw new NotFoundException("쿠폰을 찾을 수 없습니다.")
        }
    }

    async issueCoupon(couponId: string, userId: string): Promise<IssueResult> {
        const result = await this.redisService.issueCouponWithLua(couponId, userId);

        if (result === -1) return {status: 'DUPLICATED'};
        if (result === 0) return {status: 'SOLD_OUT'};
        return { status: 'SUCCESS', remaining: result};

    }
}
