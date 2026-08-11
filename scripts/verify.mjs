/**
 * 부하 테스트 사후 정합성 검증.
 *
 * Redis와 DB를 직접 대조해서 다음 셋이 일치하는지 본다.
 *   (1) 설정 재고 − Redis 잔여 수량   = 실제로 차감된 수
 *   (2) DB issued_coupons 행 수        = 실제로 기록된 수
 *   (3) k6가 센 SUCCESS 응답 수         = 사용자에게 성공이라고 답한 수
 *
 * (1) ≠ (2) 면 재고는 줄었는데 DB에 안 남은 것 → fire-and-forget 유실.
 * (3) > (2) 면 성공이라고 답해놓고 실제로는 못 받은 사용자가 있는 것.
 *
 * 사용법:
 *   npm run verify                 # k6 요약 없이 Redis/DB만 대조
 *   npm run verify -- --issued=980 # k6가 센 SUCCESS 수를 넘겨 3자 대조
 */
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Redis from 'ioredis';

const SEED_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'k6', 'seed.json');
const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = Number(process.env.REDIS_PORT || 6379);

const issuedArg = process.argv.find((a) => a.startsWith('--issued='));
const k6Issued = issuedArg ? Number(issuedArg.split('=')[1]) : null;

const redis = new Redis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
});
redis.on('error', () => {});

const row = (label, value) => `  ${label.padEnd(28)} ${value}`;

async function main() {
    const seed = JSON.parse(await readFile(SEED_PATH, 'utf8'));

    const res = await fetch(`${seed.baseUrl}/api/admin/coupons/${seed.couponId}`);
    if (!res.ok) throw new Error(`쿠폰 조회 실패: ${res.status}`);
    const { stats } = await res.json();

    const redisRemaining = Number(await redis.get(`coupon:${seed.couponId}:remaining`));
    const consumed = seed.stock - redisRemaining;
    const persisted = stats.issuedCount;

    console.log(`\n쿠폰 ${seed.couponId}\n`);
    console.log(row('설정 재고', seed.stock));
    console.log(row('Redis 잔여 수량', redisRemaining));
    console.log(row('차감된 재고 (1)', consumed));
    console.log(row('DB 발급 건수 (2)', persisted));
    if (k6Issued !== null) console.log(row('k6 SUCCESS 응답 (3)', k6Issued));

    console.log('');
    let failures = 0;

    if (consumed === persisted) {
        console.log(`  ✅ (1) = (2) — 차감된 재고가 전부 DB에 기록됐다`);
    } else {
        failures++;
        console.log(
            `  ❌ (1) ≠ (2) — ${consumed - persisted}건이 재고만 줄고 DB에 없다\n` +
            `     → DB 저장이 fire-and-forget이라 실패가 로그로만 사라진다.\n` +
            `       아웃박스 패턴이나 큐 기반 기록으로 바꿔야 복구가 가능해진다.`,
        );
    }

    if (k6Issued !== null) {
        if (k6Issued === persisted) {
            console.log(`  ✅ (3) = (2) — 성공이라고 답한 만큼 실제로 발급됐다`);
        } else {
            failures++;
            console.log(
                `  ❌ (3) ≠ (2) — ${k6Issued - persisted}명이 성공 응답을 받고도 쿠폰이 없다`,
            );
        }
    }

    if (consumed > seed.stock) {
        failures++;
        console.log(`  ❌ 초과 발급 ${consumed - seed.stock}건 — 원자성이 깨졌다`);
    } else if (redisRemaining === 0) {
        console.log(`  ✅ 초과 발급 없음 — 재고를 정확히 소진했다`);
    } else {
        console.log(`  ℹ️  재고가 ${redisRemaining}개 남았다 (부하가 재고에 못 미쳤다)`);
    }

    console.log(failures === 0 ? `\n✅ 정합성 유지됨.\n` : `\n❌ ${failures}건 불일치.\n`);

    await redis.quit();
    process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
    if (err.code === 'ENOENT') {
        console.error(`\n❌ k6/seed.json 이 없습니다. npm run seed 를 먼저 실행하세요.`);
    } else if (/ECONNREFUSED|MaxRetries|fetch failed/.test(err.message ?? '')) {
        console.error(`\n❌ 서버 또는 Redis에 연결하지 못했습니다.\n   docker compose up -d 확인.`);
    } else {
        console.error(`\n❌ ${err.message}`);
    }
    redis.disconnect();
    process.exit(1);
});
