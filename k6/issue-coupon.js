/**
 * 선착순 쿠폰 발급 부하 시나리오.
 *
 * 사전 준비:
 *   docker compose up -d --build
 *   npm run seed
 *
 * 실행:
 *   k6 run k6/issue-coupon.js                     # 기본: stampede
 *   k6 run -e SCENARIO=ramp k6/issue-coupon.js    # 한계점 탐색
 *
 * 사후 검증:
 *   npm run verify
 *
 * 두 시나리오는 목적이 다르다.
 *   stampede — 재고보다 많은 인원이 동시에 몰릴 때 정합성이 유지되는가
 *   ramp     — 처리량을 올려가며 레이턴시가 무너지는 지점(knee)이 어디인가
 */
import http from 'k6/http';
import { check } from 'k6';
import exec from 'k6/execution';
import { Counter, Trend } from 'k6/metrics';
import { SharedArray } from 'k6/data';

// 시드는 VU마다 복사되지 않도록 SharedArray로 한 번만 읽는다.
const seed = new SharedArray('seed', () => [JSON.parse(open('./seed.json'))])[0];

const BASE_URL = __ENV.BASE_URL || seed.baseUrl;
const SCENARIO = __ENV.SCENARIO || 'stampede';

const issued = new Counter('coupon_issued');
const soldOut = new Counter('coupon_sold_out');
const duplicated = new Counter('coupon_duplicated');
const unexpected = new Counter('coupon_unexpected');
const issueLatency = new Trend('coupon_issue_duration', true);

const scenarios = {
    // 재고의 3배 인원이 한꺼번에 몰린다. 정합성 검증이 목적.
    stampede: {
        executor: 'shared-iterations',
        vus: Number(__ENV.VUS || 200),
        iterations: Number(__ENV.ITERATIONS || Math.min(seed.stock * 3, seed.userIds.length)),
        maxDuration: '5m',
    },
    // 초당 요청 수를 단계적으로 올려 한계점을 찾는다. 성능 측정이 목적.
    ramp: {
        executor: 'ramping-arrival-rate',
        startRate: Number(__ENV.START_RATE || 50),
        timeUnit: '1s',
        preAllocatedVUs: Number(__ENV.VUS || 200),
        maxVUs: Number(__ENV.MAX_VUS || 1000),
        stages: [
            { target: Number(__ENV.PEAK_RATE || 1000), duration: '30s' },
            { target: Number(__ENV.PEAK_RATE || 1000), duration: '1m' },
            { target: 0, duration: '10s' },
        ],
    },
};

export const options = {
    scenarios: { [SCENARIO]: scenarios[SCENARIO] },
    thresholds: {
        // 정의되지 않은 상태값이 오면 응답 계약이 깨진 것이다.
        coupon_unexpected: ['count==0'],
        http_req_failed: ['rate<0.01'],

        // stampede는 반복 횟수를 사용자 수 이하로 제한하므로 사용자가 겹치지 않는다.
        // 따라서 중복 응답이 1건이라도 나오면 로직 결함이다.
        //
        // ramp는 도착률 × 시간이라 총 반복 횟수가 사용자 수를 넘을 수 있고,
        // 그때는 인덱스가 한 바퀴 돌아 중복이 나오는 게 정상이다. 그래서 걸지 않는다.
        ...(SCENARIO === 'stampede' ? { coupon_duplicated: ['count==0'] } : {}),

        // 기준치가 아니라 기록이 목적이다. 실측 후 실제 값으로 조정한다.
        coupon_issue_duration: ['p(95)<500', 'p(99)<1000'],
    },
    summaryTrendStats: ['avg', 'min', 'med', 'p(95)', 'p(99)', 'max'],
};

export function setup() {
    console.log(
        `시나리오: ${SCENARIO} / 재고 ${seed.stock} / 사용자 풀 ${seed.userIds.length}명`,
    );
    if (SCENARIO === 'ramp') {
        console.log(
            `  주의: 총 반복이 ${seed.userIds.length}회를 넘으면 사용자 인덱스가 한 바퀴 돌아\n` +
            `        DUPLICATED가 섞인다. 순수 처리량만 보려면 USERS를 늘려 다시 시드할 것.`,
        );
    }
}

export default function () {
    // 시나리오 전체에서 고유하게 증가하는 인덱스.
    //
    // (__VU - 1) * N + __ITER 같은 수동 조합은 N과 사용자 수의 최대공약수만큼
    // 주기가 생겨 서로 다른 VU가 같은 사용자를 집는다. 그러면 요청 대부분이
    // DUPLICATED로 튕겨 부하가 걸리지 않는다.
    const index = exec.scenario.iterationInTest;
    const userId = seed.userIds[index % seed.userIds.length];

    const res = http.post(
        `${BASE_URL}/api/admin/coupons/${seed.couponId}/issue`,
        JSON.stringify({ userId }),
        {
            headers: { 'Content-Type': 'application/json' },
            tags: { name: 'issue' },
        },
    );

    issueLatency.add(res.timings.duration);

    let status = null;
    try {
        status = res.json('status');
    } catch (_) {
        // 파싱 실패는 아래 check에서 잡힌다
    }

    check(res, {
        'HTTP 2xx': (r) => r.status >= 200 && r.status < 300,
        '알려진 상태값': () =>
            ['SUCCESS', 'SOLD_OUT', 'DUPLICATED', 'EXPIRED', 'NOT_STARTED'].includes(status),
    });

    switch (status) {
        case 'SUCCESS': issued.add(1); break;
        case 'SOLD_OUT': soldOut.add(1); break;
        case 'DUPLICATED': duplicated.add(1); break;
        default: unexpected.add(1); break;
    }
}

export function teardown() {
    // 서버가 집계한 최종 상태. k6가 센 SUCCESS 수와 일치해야 한다.
    const res = http.get(`${BASE_URL}/api/admin/coupons/${seed.couponId}`);
    if (res.status !== 200) {
        console.error(`최종 상태 조회 실패: ${res.status}`);
        return;
    }
    const stats = res.json('stats');
    console.log(
        `\n[최종 상태]\n` +
        `  재고(설정)          : ${seed.stock}\n` +
        `  DB 발급 건수        : ${stats.issuedCount}\n` +
        `  Redis 잔여 수량     : ${stats.remainingCount}\n` +
        `  차감된 재고          : ${seed.stock - stats.remainingCount}\n\n` +
        `  위 세 값과 요약의 coupon_issued 가 모두 일치해야 정합성이 유지된 것이다.\n` +
        `  정밀 대조는 npm run verify 로 확인할 것.`,
    );
}
