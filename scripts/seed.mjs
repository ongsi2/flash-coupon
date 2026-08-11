/**
 * 부하 테스트용 시드 생성기.
 *
 * k6는 setup()에 시간 제한이 있어 수천 건의 사용자 생성을 넣기 어렵다.
 * 그래서 시드는 별도로 만들어 k6/seed.json 에 떨어뜨리고, k6는 읽기만 한다.
 *
 * 사용법:
 *   npm run seed                      # 기본: 사용자 3000명, 재고 1000개
 *   USERS=10000 STOCK=5000 npm run seed
 *
 * 환경변수: BASE_URL(기본 http://localhost:3000), USERS, STOCK
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const USERS = Number(process.env.USERS || 3000);
const STOCK = Number(process.env.STOCK || 1000);
const CONCURRENCY = Number(process.env.SEED_CONCURRENCY || 50);

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'k6', 'seed.json');

async function post(path, body) {
    const res = await fetch(`${BASE_URL}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        throw new Error(`POST ${path} → ${res.status} ${await res.text()}`);
    }
    return res.json();
}

/** 동시 실행 수를 제한하면서 작업을 처리한다 */
async function pooled(items, limit, worker) {
    const results = new Array(items.length);
    let cursor = 0;
    const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (cursor < items.length) {
            const i = cursor++;
            results[i] = await worker(items[i], i);
        }
    });
    await Promise.all(runners);
    return results;
}

async function main() {
    // 서버가 떠 있는지 먼저 확인한다. 여기서 실패하면 원인이 명확하다.
    const ping = await fetch(`${BASE_URL}/api/admin/coupons`).catch(() => null);
    if (!ping?.ok) {
        throw new Error(
            `서버(${BASE_URL})에 연결하지 못했습니다.\n` +
            `   docker compose up -d --build 로 스택을 먼저 띄우세요.`,
        );
    }

    console.log(`사용자 ${USERS}명 생성 중... (동시 ${CONCURRENCY})`);
    const started = Date.now();
    const stamp = started.toString(36);

    const users = await pooled(
        Array.from({ length: USERS }, (_, i) => i),
        CONCURRENCY,
        async (i) => {
            const user = await post('/api/users/test', {
                email: `load-${stamp}-${i}@example.com`,
                name: `부하테스트유저-${i}`,
            });
            if ((i + 1) % 500 === 0) console.log(`  ${i + 1}/${USERS}`);
            return user.id;
        },
    );

    console.log(`재고 ${STOCK}개 쿠폰 생성 중...`);
    const now = Date.now();
    const coupon = await post('/api/admin/coupons', {
        name: `부하테스트 선착순 쿠폰 (${new Date(now).toISOString()})`,
        type: 'FCFS',
        discountType: 'AMOUNT',
        discountValue: 5000,
        totalQuantity: STOCK,
        startAt: new Date(now - 60 * 60 * 1000).toISOString(),
        endAt: new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });

    const seed = { baseUrl: BASE_URL, couponId: coupon.id, stock: STOCK, userIds: users };
    await mkdir(dirname(OUT), { recursive: true });
    await writeFile(OUT, JSON.stringify(seed, null, 2));

    console.log(
        `\n✅ 시드 생성 완료 (${((Date.now() - started) / 1000).toFixed(1)}초)\n` +
        `   쿠폰 ID : ${coupon.id}\n` +
        `   재고    : ${STOCK}\n` +
        `   사용자  : ${users.length}명\n` +
        `   파일    : k6/seed.json\n\n` +
        `다음: k6 run k6/issue-coupon.js`,
    );
}

main().catch((err) => {
    console.error(`\n❌ ${err.message}`);
    process.exit(1);
});
