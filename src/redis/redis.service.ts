import {Injectable} from '@nestjs/common';
import {ConfigService} from "@nestjs/config";

import {Redis} from "ioredis";
import {
    DEFAULT_ISSUE_TTL_SECONDS,
    ISSUE_COUPON_LUA,
    issuedKeyOf,
    remainingKeyOf,
} from "./issue-coupon.script";

export interface IssueLuaResult {
    /** 1 = 발급 성공, 0 = 재고 소진, -1 = 중복 발급 */
    code: number;
    /** 발급 후 잔여 수량 (code === 1 일 때만 의미 있음) */
    remaining: number;
}


@Injectable()
export class RedisService {
    private client: Redis;

    constructor(private readonly configService: ConfigService) {
        this.client = new Redis({
            host: this.configService.get('REDIS_HOST') || '127.0.0.1',
            port: this.configService.get('REDIS_PORT') || 6379,
            // 공개망에 노출되는 환경에서는 requirepass가 필수다.
            // 로컬 개발에서는 비워 두면 인증 없이 접속한다.
            password: this.configService.get('REDIS_PASSWORD') || undefined,
        });
    }

    getClient() {
        return this.client;
    }

    async onModuleInit() {
        console.log('Redis ping:', await this.client.ping());
    }

    /**
     * 발급 시도. 스크립트 본문은 issue-coupon.script.ts 참고.
     *
     * @param ttlSeconds 발급 이력 TTL(초). 쿠폰 종료 시각까지로 넘기는 것이 맞다.
     *                   기본값(24시간)은 쿠폰 기간이 그보다 길면 이력이 먼저 만료되어
     *                   재발급이 통과하고 재고만 차감되는 문제가 있다.
     */
    async issueCouponWithLua(
        couponId: string,
        userId: string,
        ttlSeconds: number = DEFAULT_ISSUE_TTL_SECONDS,
    ):Promise<IssueLuaResult>
    {
        const [code, remaining] = await this.client.eval(
            ISSUE_COUPON_LUA,
            2,
            remainingKeyOf(couponId),
            issuedKeyOf(couponId, userId),
            String(ttlSeconds),
        ) as [number, number];

        return { code: Number(code), remaining: Number(remaining) };
    }

}
