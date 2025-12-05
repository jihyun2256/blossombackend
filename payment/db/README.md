# 결제 시스템 데이터베이스

이 디렉토리는 결제 시스템의 데이터베이스 스키마 및 마이그레이션 스크립트를 포함합니다.

## 파일 목록

- **schema.sql**: 모든 테이블 정의가 포함된 완전한 데이터베이스 스키마
- **init.js**: 데이터베이스 초기화 스크립트 (테이블 생성)
- **migrations.js**: 기존 테이블 수정을 위한 마이그레이션 유틸리티
- **seed.js**: 테스트 데이터 생성 스크립트

## 데이터베이스 테이블

### 1. orders (주문)
결제 참조와 함께 주문 정보를 저장합니다.

**컬럼:**
- `id`: 기본 키
- `user_id`: 주문을 생성한 사용자
- `total_price`: 총 주문 금액
- `status`: 주문 상태 (pending, paid, payment_failed, cancelled)
- `payment_method`: 사용된 결제 수단
- `payment_id`: 결제 레코드 참조
- `created_at`, `updated_at`: 타임스탬프

**인덱스:**
- `idx_user_id`: 사용자 주문 조회용
- `idx_status`: 상태 필터링용
- `idx_payment_id`: 결제 조회용

### 2. order_items (주문 항목)
각 주문의 개별 항목을 저장합니다.

**컬럼:**
- `id`: 기본 키
- `order_id`: orders 테이블 외래 키
- `product_id`: 상품 식별자
- `quantity`: 항목 수량
- `price`: 주문 시점의 항목 가격
- `created_at`: 타임스탬프

**인덱스:**
- `idx_order_id`: 주문 항목 조회용
- `idx_product_id`: 상품 조회용

### 3. payments (결제)
결제 트랜잭션 정보를 저장합니다.

**컬럼:**
- `id`: 기본 키
- `payment_id`: 고유 결제 식별자 (UUID)
- `order_id`: orders 테이블 외래 키
- `user_id`: 결제를 수행한 사용자
- `amount`: 결제 금액
- `payment_method`: 결제 수단 (card, bank_transfer, mobile)
- `status`: 결제 상태 (pending, completed, failed, cancelled)
- `transaction_id`: 외부 게이트웨이 트랜잭션 ID
- `gateway_response`: 게이트웨이 응답 데이터 (암호화됨)
- `idempotency_key`: 중복 방지를 위한 고유 키
- `created_at`, `updated_at`: 타임스탬프

**인덱스:**
- `idx_payment_id`: 결제 조회용
- `idx_order_id`: 주문 결제 조회용
- `idx_user_id`: 사용자 결제 조회용
- `idx_idempotency_key`: 중복 감지용
- `idx_status`: 상태 필터링용
- `idx_created_at`: 시간 기반 조회용

**보안 주의사항:**
- ⚠️ **절대로** 원본 카드번호, CVV, API 키를 저장하지 마세요
- 결제 게이트웨이 토큰과 트랜잭션 ID만 저장하세요
- gateway_response의 민감한 데이터는 암호화되어야 합니다

### 4. payment_cancellations (결제 취소)
결제 취소 기록을 저장합니다.

**컬럼:**
- `id`: 기본 키
- `cancellation_id`: 고유 취소 식별자 (UUID)
- `payment_id`: payments 테이블 외래 키
- `reason`: 취소 사유
- `cancelled_by`: 취소를 수행한 사용자 ID
- `created_at`: 타임스탬프

**인덱스:**
- `idx_payment_id`: 결제 취소 조회용
- `idx_cancellation_id`: 취소 조회용
- `idx_created_at`: 시간 기반 조회용

### 5. idempotency_keys (중복 방지 키)
중복 결제를 방지하기 위한 idempotency 키를 저장합니다.

**컬럼:**
- `id`: 기본 키
- `idempotency_key`: 클라이언트의 고유 키 (UUID)
- `request_hash`: 요청 파라미터의 해시
- `response_data`: 캐시된 응답
- `expires_at`: 만료 타임스탬프 (24시간)
- `created_at`: 타임스탬프

**인덱스:**
- `idx_key`: 키 조회용
- `idx_expires`: 정리 쿼리용

**정리:**
- 키는 24시간 후 만료됩니다
- 만료된 키는 주기적으로 정리되어야 합니다

## 설정 방법

### 사전 요구사항

1. MySQL 서버 실행 중
2. 데이터베이스 생성됨
3. `.env` 파일에 환경 변수 설정:
   ```
   DB_HOST=localhost
   DB_USER=your_user
   DB_PASSWORD=your_password
   DB_NAME=your_database
   ```

### 옵션 1: 완전 설정 (권장)

테이블을 생성하고 마이그레이션을 실행하는 완전한 설정 스크립트 실행:

```bash
npm run db:init
```

### 옵션 2: 단계별 설정

#### 스키마 초기화 (테이블 생성)
```bash
node payment/db/init.js
```

#### 마이그레이션 실행 (기존 테이블 수정)
```bash
node -e "import('./payment/db/migrations.js').then(m => m.migrateOrdersTables())"
```

### 옵션 3: 수동 SQL 실행

MySQL에서 SQL 파일을 직접 실행:

```bash
mysql -u your_user -p your_database < payment/db/schema.sql
```

## 검증

설정 후 테이블이 생성되었는지 확인:

```sql
SHOW TABLES;
```

예상 출력:
- orders
- order_items
- payments
- payment_cancellations
- idempotency_keys

테이블 구조 확인:

```sql
DESCRIBE orders;
DESCRIBE payments;
DESCRIBE payment_cancellations;
DESCRIBE idempotency_keys;
```

## 마이그레이션

### 기존 Orders 테이블에 payment_id 추가

`payment_id` 컬럼이 없는 기존 `orders` 테이블이 있는 경우, 마이그레이션 스크립트가 자동으로 추가합니다:

```javascript
import { migrateOrdersTables } from './payment/db/migrations.js';
await migrateOrdersTables();
```

## 유지보수

### 만료된 Idempotency 키 정리

Idempotency 키는 24시간 후 만료됩니다. 정리하려면:

```sql
DELETE FROM idempotency_keys 
WHERE expires_at < NOW();
```

이 작업은 주기적으로 실행되어야 합니다 (예: 일일 cron 작업) 또는 애플리케이션 코드에 구현되어야 합니다.

### 테스트 데이터 생성

테스트를 위한 샘플 데이터를 생성하려면:

```bash
npm run db:seed
```

이 명령은 다음을 생성합니다:
- 4개의 샘플 주문
- 1개의 완료된 결제
- Idempotency 키
- 주문 항목

## 보안 고려사항

1. **민감한 결제 데이터를 절대 저장하지 마세요:**
   - 원본 카드번호 금지
   - CVV/CVC 코드 금지
   - 암호화되지 않은 API 키 금지

2. **파라미터화된 쿼리 사용:**
   - 모든 쿼리는 prepared statement를 사용해야 합니다
   - 사용자 입력을 SQL에 직접 연결하지 마세요

3. **암호화:**
   - `gateway_response`의 민감한 데이터를 암호화하세요
   - 암호화 키는 환경 변수를 사용하세요

4. **접근 제어:**
   - 데이터베이스 사용자 권한을 제한하세요
   - 리포팅용으로 별도의 읽기 전용 사용자를 사용하세요

5. **감사 로깅:**
   - 모든 결제 작업에 타임스탬프가 기록됩니다
   - 취소는 누가 수행했는지 추적합니다

## 문제 해결

### 연결 오류

연결 오류가 발생하면:
1. MySQL 서버가 실행 중인지 확인
2. `.env`의 자격 증명 확인
3. 데이터베이스가 존재하는지 확인
4. 사용자 권한 확인

### 테이블이 이미 존재함

테이블이 이미 존재하면 스크립트는 생성을 건너뜁니다. 재생성하려면:

```sql
DROP TABLE IF EXISTS payment_cancellations;
DROP TABLE IF EXISTS idempotency_keys;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS orders;
```

그런 다음 설정을 다시 실행하세요.

### 외래 키 오류

테이블이 올바른 순서로 생성되었는지 확인:
1. orders
2. order_items
3. payments
4. payment_cancellations
5. idempotency_keys

schema.sql 파일이 이를 자동으로 처리합니다.

## 추가 리소스

- [메인 README](../README.md) - 전체 프로젝트 문서
- [테스트 가이드](../tests/README.md) - 테스트 실행 방법
- [보안 가이드](../SECURITY_GUIDE.md) - 보안 모범 사례
