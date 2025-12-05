# Payment System API

보안 결제 시스템 API - Node.js + Express + MySQL 기반의 마이크로서비스

## 목차

- [개요](#개요)
- [주요 기능](#주요-기능)
- [API 엔드포인트](#api-엔드포인트)
- [환경 변수 설정](#환경-변수-설정)
- [로컬 개발 가이드](#로컬-개발-가이드)
- [보안 고려사항](#보안-고려사항)
- [테스트](#테스트)
- [배포](#배포)

## 개요

Payment System API는 전자상거래 플랫폼을 위한 보안 결제 처리 시스템입니다. 주문 생성, 결제 처리, 결제 취소 기능을 제공하며, PCI-DSS 준수를 위한 다양한 보안 기능을 포함합니다.

### 기술 스택

- Node.js 18+
- Express.js
- MySQL 8.0+
- Docker & Kubernetes

## 주요 기능

- ✅ 주문 생성 및 관리
- ✅ 안전한 결제 처리
- ✅ 결제 취소 및 환불
- ✅ SQL Injection 방어
- ✅ 중복 결제 방지 (Idempotency)
- ✅ 민감정보 보호 (PCI-DSS 준수)
- ✅ 트랜잭션 안전성
- ✅ 로그 민감정보 마스킹
- ✅ AES-256 암호화

## API 엔드포인트

### Health Check

#### GET /health
서비스 상태 확인

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### 주문 관리

#### POST /orders
새 주문 생성

**Headers:**
- `Authorization: Bearer <JWT_TOKEN>`

**Request Body:**
```json
{
  "user_id": 123,
  "items": [
    {
      "product_id": 1,
      "quantity": 2,
      "price": 29.99
    }
  ],
  "total_price": 59.98
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "order_id": 456,
  "status": "pending",
  "message": "Order created successfully"
}
```

**Error Response (400 Bad Request):**
```json
{
  "success": false,
  "message": "Validation error",
  "error_code": "VALIDATION_ERROR",
  "details": {
    "field": "total_price",
    "issue": "Must be a positive number"
  }
}
```

### 결제 처리

#### POST /payments
결제 요청 및 처리

**Headers:**
- `Authorization: Bearer <JWT_TOKEN>`

**Request Body:**
```json
{
  "order_id": 456,
  "payment_method": "card",
  "idempotency_key": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "payment_id": "PAY_123456789",
  "transaction_id": "TXN_987654321",
  "status": "completed",
  "message": "Payment processed successfully"
}
```

**중복 요청 Response (200 OK):**
```json
{
  "success": true,
  "payment_id": "PAY_123456789",
  "transaction_id": "TXN_987654321",
  "status": "completed",
  "message": "Payment already processed (idempotent response)"
}
```

**Error Response (422 Unprocessable Entity):**
```json
{
  "success": false,
  "message": "Order not found or already paid",
  "error_code": "INVALID_ORDER_STATUS"
}
```

#### GET /payments/:id
결제 정보 조회

**Headers:**
- `Authorization: Bearer <JWT_TOKEN>`

**Response (200 OK):**
```json
{
  "success": true,
  "payment": {
    "payment_id": "PAY_123456789",
    "order_id": 456,
    "user_id": 123,
    "amount": 59.98,
    "payment_method": "card",
    "status": "completed",
    "transaction_id": "TXN_987654321",
    "created_at": "2024-01-01T00:00:00.000Z"
  }
}
```

#### POST /payments/:id/cancel
결제 취소 및 환불

**Headers:**
- `Authorization: Bearer <JWT_TOKEN>`

**Request Body:**
```json
{
  "reason": "Customer requested refund"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "cancellation_id": "CAN_123456789",
  "payment_id": "PAY_123456789",
  "status": "cancelled",
  "message": "Payment cancelled successfully"
}
```

### 결제 수단 (payment_method)

지원되는 결제 수단:
- `card` - 신용/체크카드
- `bank_transfer` - 계좌이체
- `mobile` - 모바일 결제

### 상태 코드 (status)

주문 상태:
- `pending` - 결제 대기
- `paid` - 결제 완료
- `payment_failed` - 결제 실패
- `cancelled` - 취소됨

결제 상태:
- `pending` - 처리 중
- `completed` - 완료
- `failed` - 실패
- `cancelled` - 취소됨

## 환경 변수 설정

### 필수 환경 변수

`.env` 파일을 생성하고 다음 변수들을 설정하세요:

```bash
# 서버 설정
PORT=3004
NODE_ENV=development

# 데이터베이스 설정
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=ecommerce

# JWT 인증
JWT_SECRET=your_jwt_secret_key_here

# 암호화 설정 (AES-256)
ENCRYPTION_KEY=your_32_character_encryption_key
ENCRYPTION_IV=your_16_character_iv_key

# 로깅 설정
LOG_LEVEL=info
```

### 환경 변수 설명

| 변수 | 설명 | 기본값 | 필수 |
|------|------|--------|------|
| `PORT` | API 서버 포트 | 3004 | ✅ |
| `NODE_ENV` | 실행 환경 (development/production) | development | ✅ |
| `DB_HOST` | MySQL 호스트 | localhost | ✅ |
| `DB_PORT` | MySQL 포트 | 3306 | ✅ |
| `DB_USER` | 데이터베이스 사용자 | - | ✅ |
| `DB_PASSWORD` | 데이터베이스 비밀번호 | - | ✅ |
| `DB_NAME` | 데이터베이스 이름 | - | ✅ |
| `JWT_SECRET` | JWT 토큰 서명 키 | - | ✅ |
| `ENCRYPTION_KEY` | AES-256 암호화 키 (32자) | - | ✅ |
| `ENCRYPTION_IV` | AES-256 초기화 벡터 (16자) | - | ✅ |
| `LOG_LEVEL` | 로그 레벨 (debug/info/warn/error) | info | ❌ |

### 암호화 키 생성

```bash
# ENCRYPTION_KEY 생성 (32 bytes)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# ENCRYPTION_IV 생성 (16 bytes)
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
```

## 로컬 개발 가이드

### 사전 요구사항

- Node.js 18 이상
- MySQL 8.0 이상
- npm 또는 yarn

### 설치 및 실행

1. **의존성 설치**

```bash
cd payment
npm install
```

2. **환경 변수 설정**

```bash
# .env.example을 복사하여 .env 파일 생성
cp .env.example .env

# .env 파일을 편집하여 실제 값 입력
nano .env
```

3. **데이터베이스 초기화**

```bash
# MySQL 접속
mysql -u root -p

# 데이터베이스 생성
CREATE DATABASE ecommerce;
USE ecommerce;

# 스키마 실행
source db/schema.sql
```

또는 Node.js 스크립트 사용:

```bash
node db/init.js
```

4. **서버 실행**

```bash
# 개발 모드 (nodemon 사용)
npm run dev

# 프로덕션 모드
npm start
```

서버가 `http://localhost:3004`에서 실행됩니다.

5. **Health Check 확인**

```bash
curl http://localhost:3004/health
```

### 개발 워크플로우

1. **코드 수정**
   - `routes/`, `services/`, `middleware/`, `utils/` 디렉토리에서 작업

2. **테스트 실행**
   ```bash
   npm test
   ```

3. **보안 검증**
   ```bash
   node tests/security-verification.js
   ```

4. **통합 테스트**
   ```bash
   node tests/integration.test.js
   ```

### Docker로 실행

```bash
# 이미지 빌드
docker build -t payment-api .

# 컨테이너 실행
docker run -p 3004:3004 --env-file .env payment-api
```

### Docker Compose로 실행

```bash
# 전체 스택 실행 (MySQL 포함)
docker-compose -f docker-compose.payments.yml up -d

# 로그 확인
docker-compose -f docker-compose.payments.yml logs -f payment-api

# 중지
docker-compose -f docker-compose.payments.yml down
```

## 보안 고려사항

### 1. SQL Injection 방어

✅ **구현된 보안 조치:**
- 모든 데이터베이스 쿼리에 parameterized query 사용
- 사용자 입력을 직접 쿼리에 삽입하지 않음
- 입력 값 검증 및 정제

```javascript
// ❌ 잘못된 예
const query = `SELECT * FROM orders WHERE id = ${orderId}`;

// ✅ 올바른 예
const query = 'SELECT * FROM orders WHERE id = ?';
connection.query(query, [orderId]);
```

### 2. 민감정보 보호 (PCI-DSS 준수)

✅ **구현된 보안 조치:**
- 카드번호, CVV 절대 저장 금지
- 결제 게이트웨이 토큰만 저장
- API 키는 환경 변수로 관리
- 데이터베이스 연결 정보 암호화

**저장하지 않는 정보:**
- 신용카드 번호 (전체)
- CVV/CVC 코드
- 카드 만료일
- 카드 소유자 비밀번호

**저장하는 정보:**
- 결제 게이트웨이 토큰
- 트랜잭션 ID
- 결제 상태
- 마지막 4자리 (표시용, 선택사항)

### 3. 중복 결제 방지 (Idempotency)

✅ **구현된 보안 조치:**
- 모든 결제 요청에 `idempotency_key` 필수
- 24시간 동안 중복 요청 방지
- 동일 키로 요청 시 캐시된 응답 반환

**사용 방법:**
```javascript
// 클라이언트에서 UUID v4 생성
const idempotencyKey = crypto.randomUUID();

// 결제 요청 시 포함
fetch('/payments', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    order_id: 456,
    payment_method: 'card',
    idempotency_key: idempotencyKey
  })
});
```

### 4. 로그 민감정보 마스킹

✅ **구현된 보안 조치:**
- 모든 로그에서 민감정보 자동 마스킹
- 카드번호: 마지막 4자리만 표시 (`****-****-****-1234`)
- 이메일: 첫 글자와 도메인만 표시 (`u***@example.com`)
- 전화번호: 마지막 4자리만 표시 (`***-****-1234`)
- CVV, 비밀번호, API 키: 완전 제거

### 5. 트랜잭션 안전성

✅ **구현된 보안 조치:**
- 모든 결제 작업은 트랜잭션 내에서 실행
- 실패 시 자동 롤백
- Connection release 보장 (finally 블록)
- 데이터 일관성 유지

### 6. 인증 및 권한

✅ **구현된 보안 조치:**
- JWT 기반 인증
- 사용자 본인의 주문/결제만 접근 가능
- 관리자 권한 분리

**인증 헤더:**
```
Authorization: Bearer <JWT_TOKEN>
```

### 7. HTTPS 강제

✅ **프로덕션 요구사항:**
- 모든 API는 HTTPS만 허용
- TLS 1.2 이상 사용
- 외부 게이트웨이 통신도 HTTPS

### 8. Rate Limiting

⚠️ **권장사항:**
- 동일 IP에서 과도한 요청 제한
- Nginx 또는 API Gateway 레벨에서 구현 권장

### 보안 체크리스트

배포 전 다음 사항을 확인하세요:

- [ ] 모든 환경 변수가 안전하게 설정됨
- [ ] 데이터베이스 연결이 암호화됨
- [ ] HTTPS가 활성화됨
- [ ] JWT_SECRET이 강력한 랜덤 값으로 설정됨
- [ ] ENCRYPTION_KEY가 32바이트 랜덤 값으로 설정됨
- [ ] 프로덕션 환경에서 민감정보가 로그에 노출되지 않음
- [ ] SQL Injection 방어가 모든 쿼리에 적용됨
- [ ] Rate limiting이 설정됨
- [ ] 정기적인 보안 감사 계획이 수립됨

## 테스트

### 테스트 실행

```bash
# 모든 테스트 실행
npm test

# 통합 테스트
node tests/integration.test.js

# 보안 검증
node tests/security-verification.js
```

### 테스트 커버리지

- ✅ 주문 생성 플로우
- ✅ 결제 처리 플로우
- ✅ 결제 취소 플로우
- ✅ SQL Injection 방어
- ✅ 중복 결제 방지
- ✅ 민감정보 마스킹
- ✅ 트랜잭션 롤백
- ✅ 입력 값 검증

### 수동 테스트

API 테스트를 위해 Postman 또는 curl을 사용할 수 있습니다:

```bash
# 주문 생성
curl -X POST http://localhost:3004/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "user_id": 123,
    "items": [{"product_id": 1, "quantity": 2, "price": 29.99}],
    "total_price": 59.98
  }'

# 결제 처리
curl -X POST http://localhost:3004/payments \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "order_id": 1,
    "payment_method": "card",
    "idempotency_key": "550e8400-e29b-41d4-a716-446655440000"
  }'
```

## 배포

### Docker 배포

```bash
# 이미지 빌드
docker build -t payment-api:latest .

# 컨테이너 실행
docker run -d \
  --name payment-api \
  -p 3004:3004 \
  --env-file .env \
  payment-api:latest
```

### Kubernetes 배포

```bash
# ConfigMap 및 Secret 생성
kubectl create secret generic payment-secrets \
  --from-literal=db-password=YOUR_PASSWORD \
  --from-literal=jwt-secret=YOUR_JWT_SECRET \
  --from-literal=encryption-key=YOUR_ENCRYPTION_KEY

# 배포
kubectl apply -f kubernetes/payments-api.yaml

# 상태 확인
kubectl get pods -l app=payment-api
kubectl logs -f deployment/payment-api
```

자세한 배포 가이드는 [DEPLOYMENT.md](./DEPLOYMENT.md)를 참조하세요.

## 프로젝트 구조

```
payment/
├── app.js                      # Express 앱 진입점
├── routes/
│   ├── orders.js              # 주문 라우트
│   └── payments.js            # 결제 라우트
├── services/
│   ├── orderService.js        # 주문 비즈니스 로직
│   ├── paymentService.js      # 결제 비즈니스 로직
│   └── idempotencyService.js  # 중복 방지 로직
├── middleware/
│   ├── validation.js          # 입력 검증
│   └── idempotency.js         # Idempotency 체크
├── utils/
│   ├── validator.js           # 검증 유틸리티
│   ├── logger.js              # 로깅 (마스킹)
│   └── encryption.js          # 암호화
├── db/
│   ├── schema.sql             # 데이터베이스 스키마
│   ├── init.js                # DB 초기화 스크립트
│   └── migrations.js          # 마이그레이션
├── tests/
│   ├── integration.test.js    # 통합 테스트
│   └── security-verification.js # 보안 검증
├── .env.example               # 환경 변수 예제
├── Dockerfile                 # Docker 설정
├── package.json               # 의존성 관리
├── DEPLOYMENT.md              # 배포 가이드
├── SECURITY_GUIDE.md          # 보안 가이드
└── README.md                  # 이 문서
```

## 문제 해결

### 데이터베이스 연결 실패

```
Error: connect ECONNREFUSED 127.0.0.1:3306
```

**해결 방법:**
1. MySQL 서버가 실행 중인지 확인
2. `.env` 파일의 DB 설정 확인
3. 방화벽 설정 확인

### JWT 인증 실패

```
Error: Invalid token
```

**해결 방법:**
1. JWT_SECRET이 올바르게 설정되었는지 확인
2. 토큰이 만료되지 않았는지 확인
3. Authorization 헤더 형식 확인 (`Bearer <token>`)

### Idempotency Key 오류

```
Error: Idempotency key already used
```

**해결 방법:**
- 이는 정상 동작입니다 (중복 결제 방지)
- 새로운 결제 시도 시 새로운 UUID 생성 필요

## 추가 문서

- [DEPLOYMENT.md](./DEPLOYMENT.md) - 상세 배포 가이드
- [SECURITY_GUIDE.md](./SECURITY_GUIDE.md) - 보안 가이드
- [SECURITY_REPORT.md](./SECURITY_REPORT.md) - 보안 검증 리포트

## 라이선스

이 프로젝트는 내부 사용을 위한 것입니다.

## 지원

문제가 발생하거나 질문이 있으시면 개발팀에 문의하세요.
