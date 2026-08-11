import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CouponsService } from './coupons.service';
import { Coupon } from './coupon.entity';
import { RedisService } from '../redis/redis.service';
import { IssuedCouponsService } from './services/issued-coupons.service';
import { UsersService } from '../users/users.service';

/**
 * 발급 결과 매핑에 대한 회귀 테스트.
 *
 * 초기 구현은 Lua가 단일 정수(성공 시 remaining - 1, 소진 0, 중복 -1)를 반환했다.
 * 그 탓에 "마지막 1개를 발급한 결과 0"과 "재고 소진 0"이 구분되지 않아
 * 마지막 1개가 SOLD_OUT으로 처리되고 DB에도 기록되지 않았다.
 * 아래 첫 번째 케이스가 그 버그를 고정한다.
 */
describe('CouponsService.issueCoupon', () => {
    let service: CouponsService;
    let redisService: { issueCouponWithLua: jest.Mock; getClient: jest.Mock };
    let issuedCouponsService: { createIssuedCoupon: jest.Mock };
    let couponRepository: Partial<Record<keyof Repository<Coupon>, jest.Mock>>;

    const COUPON_ID = 'coupon-uuid';
    const USER_ID = 'user-uuid';

    /** 현재 발급 가능한 기간의 쿠폰 */
    const activeCoupon = {
        id: COUPON_ID,
        totalQuantity: 100,
        startAt: new Date(Date.now() - 60_000),
        endAt: new Date(Date.now() + 60_000),
    } as Coupon;

    beforeEach(async () => {
        redisService = {
            issueCouponWithLua: jest.fn(),
            getClient: jest.fn(),
        };
        issuedCouponsService = {
            createIssuedCoupon: jest.fn().mockResolvedValue(undefined),
        };
        couponRepository = {
            findOne: jest.fn().mockResolvedValue(activeCoupon),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                CouponsService,
                { provide: getRepositoryToken(Coupon), useValue: couponRepository },
                { provide: RedisService, useValue: redisService },
                { provide: IssuedCouponsService, useValue: issuedCouponsService },
                { provide: UsersService, useValue: { findOne: jest.fn().mockResolvedValue({ id: USER_ID }) } },
            ],
        }).compile();

        service = module.get<CouponsService>(CouponsService);
    });

    it('마지막 1개를 발급하면 잔여 0이어도 SUCCESS이며 DB에 기록된다', async () => {
        redisService.issueCouponWithLua.mockResolvedValue({ code: 1, remaining: 0 });

        const result = await service.issueCoupon(COUPON_ID, USER_ID);

        expect(result).toEqual({ status: 'SUCCESS', remaining: 0 });
        expect(issuedCouponsService.createIssuedCoupon).toHaveBeenCalledWith(
            COUPON_ID,
            USER_ID,
            activeCoupon.endAt,
        );
    });

    it('재고가 소진되면 SOLD_OUT이며 DB에 기록하지 않는다', async () => {
        redisService.issueCouponWithLua.mockResolvedValue({ code: 0, remaining: 0 });

        const result = await service.issueCoupon(COUPON_ID, USER_ID);

        expect(result).toEqual({ status: 'SOLD_OUT' });
        expect(issuedCouponsService.createIssuedCoupon).not.toHaveBeenCalled();
    });

    it('이미 발급받았으면 DUPLICATED이며 DB에 기록하지 않는다', async () => {
        redisService.issueCouponWithLua.mockResolvedValue({ code: -1, remaining: 0 });

        const result = await service.issueCoupon(COUPON_ID, USER_ID);

        expect(result).toEqual({ status: 'DUPLICATED' });
        expect(issuedCouponsService.createIssuedCoupon).not.toHaveBeenCalled();
    });

    it('재고가 남아 있으면 SUCCESS와 잔여 수량을 반환한다', async () => {
        redisService.issueCouponWithLua.mockResolvedValue({ code: 1, remaining: 42 });

        const result = await service.issueCoupon(COUPON_ID, USER_ID);

        expect(result).toEqual({ status: 'SUCCESS', remaining: 42 });
    });

    it('발급 시작 전이면 NOT_STARTED이며 Redis를 호출하지 않는다', async () => {
        couponRepository.findOne!.mockResolvedValue({
            ...activeCoupon,
            startAt: new Date(Date.now() + 60_000),
        });

        const result = await service.issueCoupon(COUPON_ID, USER_ID);

        expect(result).toEqual({ status: 'NOT_STARTED' });
        expect(redisService.issueCouponWithLua).not.toHaveBeenCalled();
    });

    it('발급 기간이 지났으면 EXPIRED이며 Redis를 호출하지 않는다', async () => {
        couponRepository.findOne!.mockResolvedValue({
            ...activeCoupon,
            endAt: new Date(Date.now() - 60_000),
        });

        const result = await service.issueCoupon(COUPON_ID, USER_ID);

        expect(result).toEqual({ status: 'EXPIRED' });
        expect(redisService.issueCouponWithLua).not.toHaveBeenCalled();
    });
});
