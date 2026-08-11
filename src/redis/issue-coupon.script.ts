/**
 * 선착순 쿠폰 발급 Lua 스크립트.
 *
 * 서비스 코드와 동시성 검증 스크립트(scripts/lua-concurrency-check.mjs)가
 * 같은 스크립트를 공유하도록 별도 모듈로 분리했다.
 * 복사본을 두면 한쪽만 고쳤을 때 검증이 무의미해진다.
 *
 * KEYS[1] = coupon:{couponId}:remaining      (재고 카운터)
 * KEYS[2] = coupon:{couponId}:issued:{userId} (사용자별 발급 이력)
 * ARGV[1] = 발급 이력 TTL(초)
 *
 * 반환: [code, remaining]
 *   code  1 = 발급 성공, 0 = 재고 소진, -1 = 중복 발급
 *   remaining = 발급 후 잔여 수량 (code === 1 일 때만 의미 있음)
 *
 * 상태와 값을 하나의 정수로 겸하면 "마지막 1개를 발급한 결과 0"과
 * "재고 소진(0)"이 구분되지 않아 마지막 1개가 누락된다. 그래서 분리한다.
 */
export const ISSUE_COUPON_LUA = `
    local key = KEYS[1]
    local userKey = KEYS[2]
    local ttl = tonumber(ARGV[1])

    -- 중복 발급 체크
    if redis.call('EXISTS', userKey) == 1 then
        return {-1, 0}
    end

    -- 남은 수량 확인
    local remaining = tonumber(redis.call('GET', key))
    if remaining == nil or remaining <= 0 then
        return {0, 0}
    end

    -- 수량 감소 & 발급 기록 저장
    redis.call('DECR', key)
    redis.call('SETEX', userKey, ttl, '1')

    return {1, remaining - 1}
`;

/** 발급 이력 기본 TTL(초). 쿠폰 종료 시각을 알 수 없을 때의 폴백. */
export const DEFAULT_ISSUE_TTL_SECONDS = 86400;

/** 재고 카운터 키 */
export const remainingKeyOf = (couponId: string) => `coupon:${couponId}:remaining`;

/** 사용자별 발급 이력 키 */
export const issuedKeyOf = (couponId: string, userId: string) =>
    `coupon:${couponId}:issued:${userId}`;
