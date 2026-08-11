/**
 * Lua 발급 스크립트 동시성 검증기.
 *
 * Redis 하나만 있으면 돌아간다. NestJS도 PostgreSQL도 띄울 필요가 없다.
 * 서비스와 동일한 스크립트(src/redis/issue-coupon.script.ts)를 공유하므로
 * 스크립트를 고치면 이 검증도 같이 따라온다.
 *
 * 사용법:
 *   npm run build            # dist 생성 (최초 1회 및 스크립트 수정 시)
 *   npm run check:lua
 *
 * 환경변수: REDIS_HOST(기본 127.0.0.1), REDIS_PORT(기본 6379)
 */
import Redis from 'ioredis';
import {
    ISSUE_COUPON_LUA,
    issuedKeyOf,
    remainingKeyOf,
} from '../dist/redis/issue-coupon.script.js';

const HOST = process.env.REDIS_HOST || '127.0.0.1';
const PORT = Number(process.env.REDIS_PORT || 6379);

const redis = new Redis({
    host: HOST,
    port: PORT,
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null, // 연결 안 되면 즉시 포기 (검증기이므로 재시도 의미 없음)
});

// ioredis는 연결 실패를 error 이벤트로도 흘리는데, 핸들러가 없으면
// 스택 트레이스가 그대로 노출되어 진짜 원인이 묻힌다.
redis.on('error', () => {});

const SUCCESS = 1;
const SOLD_OUT = 0;
const DUPLICATED = -1;

/**
 * 수정 전 스크립트. 재현용으로만 보관한다 — 서비스는 쓰지 않는다.
 *
 * 상태와 값을 단일 정수에 겸했다.
 *   성공 → remaining - 1 / 소진 → 0 / 중복 → -1
 * 마지막 1개를 발급하면 remaining - 1 == 0 이 되어 호출부가 소진으로 읽는다.
 */
const LEGACY_ISSUE_COUPON_LUA = `
    local key = KEYS[1]
    local userKey = KEYS[2]

    if redis.call('EXISTS', userKey) == 1 then
        return -1
    end

    local remaining = tonumber(redis.call('GET', key))
    if remaining == nil or remaining <= 0 then
        return 0
    end

    redis.call('DECR', key)
    redis.call('SETEX', userKey, 86400, '1')

    return remaining - 1
`;

let failures = 0;

function check(label, actual, expected) {
    const ok = actual === expected;
    if (!ok) failures++;
    console.log(`  ${ok ? '✅' : '❌'} ${label}: ${actual}${ok ? '' : ` (기대값 ${expected})`}`);
}

/** 해당 쿠폰의 모든 키 제거 */
async function reset(couponId, stock) {
    const keys = await redis.keys(`coupon:${couponId}:*`);
    if (keys.length) await redis.del(...keys);
    await redis.set(remainingKeyOf(couponId), stock);
}

/** 스크립트 1회 실행 */
function issue(couponId, userId, ttl = 3600) {
    return redis.eval(
        ISSUE_COUPON_LUA,
        2,
        remainingKeyOf(couponId),
        issuedKeyOf(couponId, userId),
        String(ttl),
    );
}

/** 결과 배열을 코드별로 집계 */
function tally(results) {
    const counts = { success: 0, soldOut: 0, duplicated: 0 };
    const remainings = [];
    for (const [code, remaining] of results) {
        if (Number(code) === SUCCESS) { counts.success++; remainings.push(Number(remaining)); }
        else if (Number(code) === SOLD_OUT) counts.soldOut++;
        else if (Number(code) === DUPLICATED) counts.duplicated++;
    }
    return { ...counts, remainings };
}

/**
 * 시나리오 1: 재고보다 많은 인원이 동시에 몰린다.
 * 정확히 재고 수만큼만 성공하고, 잔여 수량은 0이어야 한다.
 */
async function scenarioStampede(stock, users) {
    console.log(`\n[1] 동시 발급 — 재고 ${stock}개에 ${users}명 동시 요청`);
    const couponId = 'check-stampede';
    await reset(couponId, stock);

    const results = await Promise.all(
        Array.from({ length: users }, (_, i) => issue(couponId, `user-${i}`)),
    );
    const { success, soldOut, duplicated, remainings } = tally(results);
    const finalRemaining = Number(await redis.get(remainingKeyOf(couponId)));

    check('발급 성공', success, stock);
    check('품절 응답', soldOut, users - stock);
    check('중복 응답', duplicated, 0);
    check('Redis 잔여 수량', finalRemaining, 0);

    // 성공 응답이 돌려준 잔여 수량은 stock-1 .. 0 을 중복 없이 한 번씩 채워야 한다.
    const unique = new Set(remainings);
    check('성공 응답의 잔여 수량이 모두 고유', unique.size, stock);
    check('최소 잔여 수량 (마지막 1개가 성공했는가)', Math.min(...remainings), 0);
    check('최대 잔여 수량', Math.max(...remainings), stock - 1);
}

/**
 * 시나리오 2: 한 사람이 동시에 여러 번 두드린다.
 * 정확히 1번만 성공해야 하고, 재고도 1개만 줄어야 한다.
 */
async function scenarioSameUser(attempts) {
    console.log(`\n[2] 중복 발급 — 동일 사용자가 ${attempts}번 동시 요청`);
    const couponId = 'check-same-user';
    const stock = 100;
    await reset(couponId, stock);

    const results = await Promise.all(
        Array.from({ length: attempts }, () => issue(couponId, 'same-user')),
    );
    const { success, duplicated } = tally(results);
    const finalRemaining = Number(await redis.get(remainingKeyOf(couponId)));

    check('발급 성공', success, 1);
    check('중복 응답', duplicated, attempts - 1);
    check('차감된 재고', stock - finalRemaining, 1);
}

/**
 * 시나리오 3: 재고 1개 경계.
 * 마지막 1개를 발급한 결과(잔여 0)가 품절로 오해받지 않아야 한다.
 * → 이 검증이 실패하면 상태와 값을 한 정수에 겸하던 버그가 되살아난 것이다.
 */
async function scenarioLastOne() {
    console.log(`\n[3] 경계 — 재고 1개를 마지막 1명이 발급`);
    const couponId = 'check-last-one';
    await reset(couponId, 1);

    const [code, remaining] = await issue(couponId, 'last-user');
    check('응답 코드 (1=성공)', Number(code), SUCCESS);
    check('잔여 수량', Number(remaining), 0);

    const [nextCode] = await issue(couponId, 'next-user');
    check('그 다음 사람의 응답 코드 (0=품절)', Number(nextCode), SOLD_OUT);
}

/**
 * 시나리오 4: TTL 확인.
 * 발급 이력 TTL이 쿠폰 종료 시각보다 짧으면, 이력이 먼저 만료되어
 * 같은 사용자가 재발급에 성공하고 재고만 추가로 차감된다.
 */
async function scenarioTtlExpiry() {
    console.log(`\n[4] TTL — 발급 이력이 쿠폰 기간보다 먼저 만료되면?`);
    const couponId = 'check-ttl';
    const stock = 10;
    await reset(couponId, stock);

    // TTL 1초로 발급한 뒤 만료를 기다린다 (실제 86400초를 기다릴 수는 없으므로 축소 재현)
    await issue(couponId, 'ttl-user', 1);
    await new Promise((r) => setTimeout(r, 1200));

    const [code] = await issue(couponId, 'ttl-user', 1);
    const finalRemaining = Number(await redis.get(remainingKeyOf(couponId)));

    console.log(`  ℹ️  이력 만료 후 재발급 응답 코드: ${Number(code)} (1이면 통과됨)`);
    console.log(`  ℹ️  차감된 재고: ${stock - finalRemaining}개 (1명이 2개를 가져감)`);
    console.log(
        `  ⚠️  현재 서비스는 TTL을 86400초로 고정한다. 쿠폰 기간이 24시간보다 길면\n` +
        `      이 경로가 실제로 열린다. DB UNIQUE 제약이 INSERT를 막지만,\n` +
        `      그 예외는 fire-and-forget catch에서 로그로만 사라지고 재고는 이미 줄어 있다.\n` +
        `      → TTL을 coupon.endAt 기준으로 넘기면 닫힌다.`,
    );
}

/**
 * 시나리오 5: 수정 전/후 대조.
 *
 * 같은 조건에서 옛 스크립트와 현재 스크립트를 각각 돌려,
 * 마지막 1개 누락이 실제로 몇 건인지 숫자로 보여준다.
 */
async function scenarioBeforeAfter(stock, users) {
    console.log(`\n[5] 수정 전/후 대조 — 재고 ${stock}개에 ${users}명 동시 요청`);

    /** 주어진 스크립트로 한 라운드 돌리고 결과를 집계한다 */
    async function round(script, parse) {
        const couponId = `check-compare-${parse.name}`;
        const keys = await redis.keys(`coupon:${couponId}:*`);
        if (keys.length) await redis.del(...keys);
        await redis.set(remainingKeyOf(couponId), stock);

        const raw = await Promise.all(
            Array.from({ length: users }, (_, i) =>
                redis.eval(
                    script, 2,
                    remainingKeyOf(couponId),
                    issuedKeyOf(couponId, `user-${i}`),
                    '3600',
                ),
            ),
        );
        const issued = raw.filter(parse).length;
        const consumed = stock - Number(await redis.get(remainingKeyOf(couponId)));
        return { issued, consumed };
    }

    // 옛 계약: 단일 정수. 호출부는 0을 소진, -1을 중복으로 읽었다.
    const legacy = await round(LEGACY_ISSUE_COUPON_LUA, function legacy(r) {
        return Number(r) > 0;
    });
    // 현재 계약: [code, remaining]
    const current = await round(ISSUE_COUPON_LUA, function current(r) {
        return Number(r[0]) === SUCCESS;
    });

    console.log(`\n  ${''.padEnd(24)}${'수정 전'.padEnd(10)}수정 후`);
    console.log(`  ${'─'.repeat(44)}`);
    console.log(
        `  ${'사용자에게 발급 성공'.padEnd(20)}${String(legacy.issued).padEnd(12)}${current.issued}`,
    );
    console.log(
        `  ${'실제 차감된 재고'.padEnd(22)}${String(legacy.consumed).padEnd(12)}${current.consumed}`,
    );
    console.log(
        `  ${'누락(차감됐지만 미발급)'.padEnd(18)}${String(legacy.consumed - legacy.issued).padEnd(12)}${current.consumed - current.issued}`,
    );

    check('수정 후 누락 건수', current.consumed - current.issued, 0);
    if (legacy.consumed - legacy.issued > 0) {
        console.log(
            `\n  ℹ️  수정 전에는 재고가 ${legacy.consumed}개 줄었는데 ${legacy.issued}명만 받았다.\n` +
            `      마지막 1개를 발급한 결과(잔여 0)가 품절과 구분되지 않았기 때문이다.`,
        );
    }
}

async function main() {
    console.log(`Redis ${HOST}:${PORT} 연결 확인...`);
    console.log(`PING → ${await redis.ping()}`);

    await scenarioStampede(100, 1000);
    await scenarioSameUser(50);
    await scenarioLastOne();
    await scenarioTtlExpiry();
    await scenarioBeforeAfter(100, 1000);

    console.log(
        failures === 0
            ? `\n✅ 전부 통과. Lua 스크립트가 동시 요청에서 재고와 중복을 정확히 통제한다.`
            : `\n❌ ${failures}건 실패.`,
    );

    await redis.quit();
    process.exit(failures === 0 ? 0 : 1);
}

const isConnectionFailure = (err) =>
    err?.code === 'ECONNREFUSED' ||
    err?.name === 'MaxRetriesPerRequestError' ||
    /ECONNREFUSED|Connection is closed/.test(err?.message ?? '');

main().catch((err) => {
    if (isConnectionFailure(err)) {
        console.error(
            `\n❌ Redis(${HOST}:${PORT})에 연결하지 못했습니다.\n\n` +
            `   Redis만 있으면 이 검증기는 돌아갑니다. 셋 중 아무거나:\n` +
            `     1) docker compose up -d redis\n` +
            `     2) 윈도우 네이티브 Redis (Memurai 등) 설치 후 실행\n` +
            `     3) 다른 호스트의 Redis: REDIS_HOST=... REDIS_PORT=... npm run check:lua`,
        );
    } else {
        console.error('\n❌ 실행 중 오류:', err);
    }
    redis.disconnect();
    process.exit(1);
});
