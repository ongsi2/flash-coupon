import {Injectable} from '@nestjs/common';
import {ConfigService} from "@nestjs/config";

import {Redis} from "ioredis";


@Injectable()
export class RedisService {
    private client: Redis;

    constructor(private readonly configService: ConfigService) {
        this.client = new Redis({
            host: this.configService.get('REDIS_HOST') || '127.0.0.1',
            port: this.configService.get('REDIS_PORT') || 6379,
        });
    }

    getClient() {
        return this.client;
    }

    async onModuleInit() {
        console.log('Redis ping:', await this.client.ping());
    }

    async issueCouponWithLua(couponId: string, userId: string):Promise<number>
    {
        const remainingKey = `coupon:${couponId}:remaining`;
        const userKey = `coupon:${couponId}:issued:${userId}`;

        const script = `
            local key = KEYS[1]
            local userKey = KEYS[2]
    
            -- 중복 발급 체크
            if redis.call('EXISTS', userKey) == 1 then
                return -1
            end
    
            -- 남은 수량 확인
            local remaining = tonumber(redis.call('GET', key))
            if remaining == nil or remaining <= 0 then
                return 0
            end
    
            -- 수량 감소 & 발급 기록 저장
            redis.call('DECR', key)
            redis.call('SETEX', userKey, 86400, '1')
    
            return remaining - 1
        `

        const result = await this.client.eval(script, 2, remainingKey, userKey);

        return Number(result);
    }

}
