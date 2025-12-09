# Flash Coupon API

선착순 쿠폰 발급 시스템 - Redis 기반 고성능 동시성 처리

## 프로젝트 소개

**Flash Coupon API**는 대규모 트래픽 환경에서 안정적으로 동작하는 선착순 쿠폰 발급 시스템입니다.
이커머스 플랫폼에서 흔히 발생하는 "쿠폰 선착순 이벤트"를 안전하고 빠르게 처리하기 위해 설계되었습니다.

### 해결하고자 하는 문제

선착순 쿠폰 발급 시스템은 다음과 같은 기술적 도전 과제를 가지고 있습니다:

1. **대량 동시 접속 처리**
   - 이벤트 시작 시점에 수만 명의 사용자가 동시에 접속
   - 초당 수천~수만 건의 쿠폰 발급 요청 처리 필요

2. **중복 발급 방지**
   - 동일 사용자가 여러 번 요청하더라도 1인 1회만 발급
   - Race Condition 상황에서도 데이터 정합성 보장

3. **재고 관리의 원자성**
   - 100개 한정 쿠폰에 정확히 100명만 발급
   - 초과 발급이나 누락 발생 절대 방지

4. **빠른 응답 속도**
   - 사용자에게 즉각적인 피드백 제공 (< 100ms)
   - 서버 부하 상황에서도 안정적인 성능 유지

### 핵심 해결 방법

이 프로젝트는 **Redis + Lua Script**를 활용한 2단계 아키텍처로 위 문제들을 해결합니다:

#### 1단계: Redis (고성능 실시간 처리)
- **Lua Script 원자적 실행**: 중복 체크 + 재고 차감을 단일 트랜잭션으로 처리
- **인메모리 연산**: 디스크 I/O 없이 밀리초 단위 응답
- **TTL 기반 임시 저장**: 발급 기록을 24시간 동안 캐시

#### 2단계: PostgreSQL (영구 저장 및 안전장치)
- **비동기 저장**: Redis 성공 후 DB에 비동기로 기록 (성능 영향 최소화)
- **UNIQUE 제약조건**: DB 레벨에서 중복 발급 이중 방지
- **감사 추적**: 모든 발급/사용 내역 영구 보관

### 실제 사용 시나리오

```
📱 고객 A: "100개 한정 5,000원 할인 쿠폰" 이벤트 참여
   ↓
⚡ 0.01초: Redis에서 중복 체크 (발급 이력 확인)
   ↓
⚡ 0.02초: Redis에서 재고 확인 및 차감 (99개 → 98개)
   ↓
✅ 0.03초: 사용자에게 "발급 성공, 잔여 98개" 응답 반환
   ↓
💾 0.5초: 백그라운드에서 PostgreSQL에 발급 기록 저장
```

**동시 접속 시나리오:**
- 1,000명이 동시에 100개 쿠폰 요청
- Redis Lua Script로 정확히 100명만 성공 처리
- 나머지 900명은 "품절" 메시지 수신
- 모든 요청이 평균 50ms 이내 응답

## 주요 기능

- 🚀 Redis Lua Script를 활용한 원자적 쿠폰 발급
- 📊 실시간 통계 대시보드
- 🔒 중복 발급 방지 (Redis + DB 이중 안전장치)
- 📅 쿠폰 기간 관리 (시작일/종료일 검증)
- 📝 발급/사용 내역 영구 저장

## 기술 스택

### Backend
- **Framework**: NestJS 11
- **Database**: PostgreSQL (TypeORM)
- **Cache**: Redis (ioredis)
- **Validation**: class-validator, class-transformer
- **Language**: TypeScript

### Frontend
- **Framework**: Next.js 14
- **UI**: Tailwind CSS
- **State Management**: React Query
- **Language**: TypeScript

### 기술 선택 이유

#### NestJS
- **엔터프라이즈급 구조**: 모듈화된 아키텍처로 확장성 보장
- **TypeScript 네이티브**: 타입 안정성으로 런타임 에러 최소화
- **의존성 주입**: 테스트 용이성 및 코드 재사용성 향상

#### Redis + Lua Script
- **원자적 연산**: EVAL 명령으로 여러 Redis 명령을 트랜잭션으로 실행
- **단일 스레드 모델**: Race Condition 원천 차단
- **높은 처리량**: 초당 10만+ 요청 처리 가능
- **낮은 레이턴시**: 평균 응답 시간 < 1ms

#### PostgreSQL
- **ACID 보장**: 데이터 정합성 및 일관성 유지
- **복잡한 쿼리 지원**: 통계 집계 및 분석 쿼리 최적화
- **성숙한 생태계**: 운영 노하우 및 도구 풍부

#### TypeORM
- **타입 안정성**: Entity 정의로 컴파일 타임 에러 감지
- **마이그레이션 관리**: 스키마 변경 이력 추적
- **관계 매핑**: 복잡한 조인 쿼리 간소화

## 시스템 아키텍처

### 전체 구조

```
┌─────────────┐
│   Client    │
│  (Browser)  │
└──────┬──────┘
       │ HTTP Request
       ▼
┌─────────────────────────────────┐
│      NestJS Application         │
│  ┌───────────────────────────┐  │
│  │  Controllers Layer        │  │
│  │  - Admin API              │  │
│  │  - User API               │  │
│  └────────┬──────────────────┘  │
│           ▼                      │
│  ┌───────────────────────────┐  │
│  │  Services Layer           │  │
│  │  - Business Logic         │  │
│  │  - Validation             │  │
│  └────┬──────────────┬───────┘  │
│       │              │           │
│       ▼              ▼           │
│  ┌─────────┐   ┌──────────┐    │
│  │  Redis  │   │PostgreSQL│    │
│  │ Service │   │ TypeORM  │    │
│  └─────────┘   └──────────┘    │
└────┬────────────────┬───────────┘
     │                │
     ▼                ▼
┌─────────┐     ┌──────────┐
│  Redis  │     │PostgreSQL│
│  Cache  │     │    DB    │
└─────────┘     └──────────┘
```

### 데이터 흐름

**쿠폰 발급 요청 처리 과정:**

```
1. 클라이언트 요청
   POST /api/admin/coupons/:id/issue
   { userId: "uuid" }

2. Controller
   ├─ DTO 유효성 검증
   └─ Service 계층 호출

3. CouponService
   ├─ 쿠폰 존재 확인 (DB)
   ├─ 사용자 존재 확인 (DB)
   ├─ 발급 기간 검증 (startAt/endAt)
   └─ RedisService.issueCoupon() 호출

4. RedisService (핵심 로직)
   ├─ Lua Script 실행
   │  ├─ EXISTS coupon:{id}:user:{userId} → 중복 체크
   │  ├─ GET coupon:{id}:remaining → 재고 확인
   │  ├─ DECR coupon:{id}:remaining → 재고 차감
   │  └─ SETEX coupon:{id}:user:{userId} → 발급 기록
   └─ 결과 반환 (remaining count or error)

5. CouponService (후처리)
   ├─ Redis 성공 시
   │  ├─ DB에 issued_coupons 레코드 INSERT
   │  └─ 성공 응답 반환
   └─ Redis 실패 시
      └─ 실패 사유 응답 반환

6. 클라이언트 응답
   { status: "SUCCESS", remaining: 99 }
```

## 환경 설정

### 필수 요구사항
- Node.js >= 18
- PostgreSQL >= 14
- Redis >= 6

### 설치

1. 의존성 설치
```bash
npm install
```

2. 환경변수 설정 (.env)
```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=flashcoupon
DB_USER=postgres
DB_PASSWORD=your_password

REDIS_HOST=127.0.0.1
REDIS_PORT=6379

PORT=3000
```

3. Redis 시작
```bash
docker run -d -p 6379:6379 redis
```

4. 서버 실행
```bash
npm run start:dev
```

### Docker Compose로 전체 스택 실행 (추천)

Docker Compose를 사용하면 PostgreSQL, Redis, 백엔드, 프론트엔드를 한 번에 실행할 수 있습니다.

```bash
# 프로젝트 루트 디렉토리에서
cd C:\springboot\node-js
docker-compose up -d --build
```

서비스 확인:
```bash
docker-compose ps
```

로그 확인:
```bash
docker-compose logs -f
```

서비스 중지:
```bash
docker-compose down
```

접속 정보:
- **Frontend**: http://localhost:3001
- **Backend API**: http://localhost:3000
- **PostgreSQL**: localhost:5432
- **Redis**: localhost:6379

## API 엔드포인트

### 관리자 API

#### 쿠폰 생성
```http
POST /api/admin/coupons
Content-Type: application/json

{
  "name": "100개 한정 선착순 쿠폰",
  "type": "FCFS",
  "discountType": "AMOUNT",
  "discountValue": 3000,
  "totalQuantity": 100,
  "startAt": "2025-12-09T00:00:00.000Z",
  "endAt": "2025-12-31T23:59:59.000Z"
}
```

**Response:**
```json
{
  "id": "uuid",
  "name": "100개 한정 선착순 쿠폰",
  "type": "FCFS",
  "discountType": "AMOUNT",
  "discountValue": 3000,
  "totalQuantity": 100,
  "startAt": "2025-12-09T00:00:00.000Z",
  "endAt": "2025-12-31T23:59:59.000Z"
}
```

#### 쿠폰 목록 조회 (통계 포함)
```http
GET /api/admin/coupons
```

**Response:**
```json
[
  {
    "id": "uuid",
    "name": "100개 한정 선착순 쿠폰",
    "type": "FCFS",
    "discountType": "AMOUNT",
    "discountValue": 3000,
    "totalQuantity": 100,
    "startAt": "2025-12-09T00:00:00.000Z",
    "endAt": "2025-12-31T23:59:59.000Z",
    "stats": {
      "issuedCount": 75,
      "usedCount": 30,
      "remainingCount": 25,
      "expiredCount": 5
    }
  }
]
```

#### 쿠폰 상세 조회
```http
GET /api/admin/coupons/:id
```

**Response:** (쿠폰 목록 조회와 동일한 형식)

#### 쿠폰 수정
```http
PATCH /api/admin/coupons/:id
Content-Type: application/json

{
  "name": "수정된 쿠폰명",
  "discountValue": 5000
}
```

#### 쿠폰 발급
```http
POST /api/admin/coupons/:id/issue
Content-Type: application/json

{
  "userId": "user-uuid"
}
```

**Response:**
```json
{
  "couponId": "uuid",
  "userId": "uuid",
  "status": "SUCCESS",
  "remaining": 99
}
```

**발급 상태 코드:**
- `SUCCESS` - 발급 성공
- `DUPLICATED` - 이미 발급받은 쿠폰
- `SOLD_OUT` - 쿠폰 소진
- `EXPIRED` - 쿠폰 기간 만료
- `NOT_STARTED` - 쿠폰 시작 전

### 사용자 API

#### 내 쿠폰 조회
```http
GET /api/user/coupons/my-coupons?userId={userId}&status=ISSUED&page=1&limit=20
```

**Query Parameters:**
- `userId` (required) - 사용자 UUID
- `status` (optional) - 쿠폰 상태 (ISSUED, USED, EXPIRED)
- `page` (optional) - 페이지 번호 (기본값: 1)
- `limit` (optional) - 페이지당 항목 수 (기본값: 20, 최대: 100)

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "couponId": "uuid",
      "couponName": "100개 한정 선착순 쿠폰",
      "discountType": "AMOUNT",
      "discountValue": 3000,
      "status": "ISSUED",
      "issuedAt": "2025-12-09T10:00:00.000Z",
      "usedAt": null,
      "expiresAt": "2025-12-31T23:59:59.000Z",
      "isExpired": false
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 5,
    "totalPages": 1
  }
}
```

#### 쿠폰 사용
```http
POST /api/user/coupons/:issuedCouponId/use
Content-Type: application/json

{
  "userId": "user-uuid"
}
```

**Response:**
```json
{
  "success": true,
  "message": "쿠폰이 사용 처리되었습니다",
  "data": {
    "id": "uuid",
    "status": "USED",
    "usedAt": "2025-12-09T12:00:00.000Z"
  }
}
```

## 아키텍처

### 발급 플로우

```
1. 클라이언트 요청 → NestJS Controller
2. 쿠폰/사용자 검증 (DB)
3. 기간 검증 (startAt/endAt)
4. Redis Lua Script 실행 (원자적 중복체크 + 수량차감)
5. Redis 성공 → DB 비동기 저장 (issued_coupons)
6. 응답 반환
```

### Redis Lua Script

Redis의 Lua Script를 사용하여 원자적 연산을 보장합니다:

```lua
-- 중복 발급 체크
if redis.call('EXISTS', userKey) == 1 then
  return -1  -- DUPLICATED
end

-- 남은 수량 확인
local remaining = tonumber(redis.call('GET', remainingKey))
if remaining == nil or remaining <= 0 then
  return 0  -- SOLD_OUT
end

-- 수량 감소 & 발급 기록
redis.call('DECR', remainingKey)
redis.call('SETEX', userKey, 86400, '1')
return remaining - 1
```

**주요 특징:**
- 중복 발급 방지: 사용자별 발급 기록을 Redis에 저장 (24시간 TTL)
- 원자성 보장: 모든 작업이 단일 트랜잭션으로 실행
- 높은 처리량: 메모리 기반 연산으로 빠른 응답 속도

### DB 스키마

#### coupons 테이블
```sql
CREATE TABLE coupons (
  id UUID PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(20) NOT NULL,
  discount_type VARCHAR(20) NOT NULL,
  discount_value INT NOT NULL,
  total_quantity INT NOT NULL,
  start_at TIMESTAMP NOT NULL,
  end_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### issued_coupons 테이블
```sql
CREATE TABLE issued_coupons (
  id UUID PRIMARY KEY,
  coupon_id UUID REFERENCES coupons(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'ISSUED',
  issued_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  UNIQUE(user_id, coupon_id)
);

-- 인덱스
CREATE INDEX idx_issued_coupons_user_status ON issued_coupons(user_id, status);
CREATE INDEX idx_issued_coupons_coupon_status ON issued_coupons(coupon_id, status);
```

**주요 설계 결정:**
- `UNIQUE(user_id, coupon_id)`: DB 레벨 중복 방지 (Redis 실패 시 안전장치)
- 인덱스: 사용자별 쿠폰 조회 및 통계 쿼리 최적화
- `expires_at` 비정규화: 조인 없이 만료 여부 확인 가능

### 동시성 제어 전략

**Layer 1 - Redis (Primary)**
- Lua Script를 통한 원자적 연산
- 중복 발급 및 재고 관리
- 빠른 응답 속도 (< 10ms)

**Layer 2 - Database (Safety Net)**
- UNIQUE 제약조건으로 중복 방지
- 영구 저장 및 감사 추적
- Redis 장애 시 데이터 복구 가능

**Eventual Consistency**
- Redis 성공 후 DB 비동기 저장
- DB 저장 실패 시 로그 기록 및 모니터링
- 주기적인 Redis-DB 동기화 배치 작업 권장

## 테스트

프로젝트에 포함된 `test_api.http` 파일을 사용하여 API를 테스트할 수 있습니다:

### 1. 테스트 사용자 생성
```http
POST http://localhost:3000/users/test
Content-Type: application/json

{
  "email": "test@example.com",
  "name": "테스트유저"
}
```

### 2. 쿠폰 생성
```http
POST http://localhost:3000/api/admin/coupons
Content-Type: application/json

{
  "name": "테스트 쿠폰",
  "type": "FCFS",
  "discountType": "AMOUNT",
  "discountValue": 5000,
  "totalQuantity": 10,
  "startAt": "2025-12-09T00:00:00.000Z",
  "endAt": "2025-12-31T23:59:59.000Z"
}
```

### 3. 쿠폰 발급
```http
POST http://localhost:3000/api/admin/coupons/{COUPON_ID}/issue
Content-Type: application/json

{
  "userId": "{USER_ID}"
}
```

### 4. 내 쿠폰 조회
```http
GET http://localhost:3000/api/user/coupons/my-coupons?userId={USER_ID}
```

### 5. 쿠폰 사용
```http
POST http://localhost:3000/api/user/coupons/{ISSUED_COUPON_ID}/use
Content-Type: application/json

{
  "userId": "{USER_ID}"
}
```

## 성능 최적화

### 현재 구현
- Redis 기반 인메모리 캐싱
- Lua Script를 통한 원자적 연산
- DB 인덱스 최적화
- 비동기 DB 저장

### 추가 최적화 방안
- 통계 데이터 Redis 캐싱 (5분 TTL)
- Redis Cluster를 통한 수평 확장
- DB 읽기 복제본 활용
- CDN을 통한 정적 리소스 제공

## 모니터링

### 주요 지표
- 쿠폰 발급 성공률
- Redis 응답 시간
- DB 저장 성공률
- API 응답 시간

### 로깅
- 쿠폰 발급 이벤트 (성공/실패)
- Redis-DB 동기화 오류
- 시스템 성능 지표

## 라이센스

MIT

## 기여

이슈 및 PR은 언제든 환영합니다.
