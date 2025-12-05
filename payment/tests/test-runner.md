# Test Runner Guide

## 통합 테스트 실행 가이드

통합 테스트는 실제 API 서버가 실행 중이어야 합니다.

### 1단계: 데이터베이스 준비

```bash
# payment 디렉토리로 이동
cd payment

# 데이터베이스 초기화
npm run db:init

# 테이블 마이그레이션
npm run db:migrate
```

### 2단계: 서버 시작 (터미널 1)

```bash
cd payment
npm start
```

서버가 정상적으로 시작되면 다음과 같은 메시지가 표시됩니다:
```
Payment API running on port 3004
Database connected successfully
```

### 3단계: 통합 테스트 실행 (터미널 2)

새 터미널을 열고:

```bash
cd payment
npm run test:integration
```

또는 직접 실행:

```bash
cd payment
node tests/integration.test.js
```

### 4단계: 보안 검증 테스트 실행

보안 검증 테스트는 서버 없이 실행 가능합니다:

```bash
cd payment
npm run test:security
```

### 전체 테스트 실행

```bash
cd payment

# 보안 검증 테스트 (서버 불필요)
npm run test:security

# 서버 시작 (백그라운드)
npm start &

# 잠시 대기 (서버 시작 시간)
sleep 3

# 통합 테스트
npm run test:integration
```

## 테스트 시나리오

### 통합 테스트 (integration.test.js)

1. **주문 생성 → 결제 → 승인 전체 플로우**
   - 주문 생성
   - 결제 요청
   - 결제 조회

2. **결제 실패 시나리오**
   - 잘못된 결제 수단
   - 존재하지 않는 주문

3. **결제 취소 시나리오**
   - 주문 생성
   - 결제 생성
   - 결제 취소
   - 취소된 결제 조회

4. **SQL Injection 공격 시도**
   - user_id에 SQL Injection
   - payment_method에 SQL Injection
   - product_id에 SQL Injection

5. **중복 결제 방지 (Idempotency)**
   - 첫 번째 결제 요청
   - 동일한 idempotency_key로 중복 요청
   - 다른 idempotency_key로 새 결제

6. **입력 검증**
   - 필수 필드 누락
   - 잘못된 데이터 타입
   - 음수 금액
   - 빈 items 배열

### 보안 검증 테스트 (security-verification.js)

1. **SQL Injection 방어 검증**
   - Parameterized query 사용 확인
   - 직접 문자열 삽입 패턴 검사

2. **민감정보 저장 방지 검증**
   - 카드번호, CVV, API 키 저장 여부 확인
   - 스키마 검증

3. **트랜잭션 안전성 검증**
   - 트랜잭션 사용 확인
   - Rollback 구현 확인
   - Connection release 확인

4. **로그 마스킹 검증**
   - 마스킹 함수 구현 확인
   - 카드번호, 이메일, 전화번호 마스킹
   - CVV, 비밀번호 완전 제거

5. **Idempotency 동작 검증**
   - Service 함수 구현 확인
   - 24시간 만료 확인
   - Middleware 확인

## 예상 결과

### 성공 시

**보안 검증 테스트:**
```
✓ 모든 보안 검증을 통과했습니다!
  - SQL Injection 방어 완료
  - 민감정보 저장 방지 완료
  - 트랜잭션 안전성 확보
  - 로그 마스킹 구현 완료
  - Idempotency 시스템 구현 완료

통과: 57
실패: 0
경고: 0
```

**통합 테스트:**
```
✓ 모든 통합 테스트를 통과했습니다!
  - 주문 생성 → 결제 → 승인 플로우 정상 작동
  - 결제 실패 시나리오 정상 처리
  - 결제 취소 시나리오 정상 작동
  - SQL Injection 공격 차단
  - 중복 결제 방지 (Idempotency) 정상 작동
  - 입력 검증 정상 작동

총 테스트: 20+
통과: 20+
실패: 0
통과율: 100%
```

## 문제 해결

### 서버 연결 실패
```
Error: fetch failed
```
**해결 방법:**
- 서버가 실행 중인지 확인: `curl http://localhost:3004/health`
- 포트 3004가 사용 가능한지 확인
- 방화벽 설정 확인

### 데이터베이스 오류
```
Error: ER_NO_SUCH_TABLE: Table 'ecommerce.orders' doesn't exist
```
**해결 방법:**
```bash
npm run db:init
npm run db:migrate
```

### 환경 변수 오류
```
Error: ENCRYPTION_KEY is not defined
```
**해결 방법:**
- `.env` 파일 생성
- 필요한 환경 변수 설정 (README.md 참조)

## CI/CD 통합 예시

### GitHub Actions

```yaml
name: Payment API Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      mysql:
        image: mysql:8.0
        env:
          MYSQL_ROOT_PASSWORD: test_password
          MYSQL_DATABASE: ecommerce
        ports:
          - 3306:3306
        options: >-
          --health-cmd="mysqladmin ping"
          --health-interval=10s
          --health-timeout=5s
          --health-retries=3
    
    steps:
      - uses: actions/checkout@v2
      
      - name: Setup Node.js
        uses: actions/setup-node@v2
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: |
          cd payment
          npm install
      
      - name: Setup database
        run: |
          cd payment
          npm run db:init
          npm run db:migrate
        env:
          DB_HOST: 127.0.0.1
          DB_USER: root
          DB_PASSWORD: test_password
          DB_NAME: ecommerce
      
      - name: Run security tests
        run: |
          cd payment
          npm run test:security
      
      - name: Start server
        run: |
          cd payment
          npm start &
          sleep 5
        env:
          DB_HOST: 127.0.0.1
          DB_USER: root
          DB_PASSWORD: test_password
          DB_NAME: ecommerce
          JWT_SECRET: test_jwt_secret
          ENCRYPTION_KEY: test_encryption_key_32_chars_
          ENCRYPTION_IV: test_iv_16_char
          PORT: 3004
      
      - name: Run integration tests
        run: |
          cd payment
          npm run test:integration
        env:
          API_BASE_URL: http://localhost:3004
```

## 테스트 커버리지

현재 구현된 테스트는 다음 요구사항을 커버합니다:

- ✓ Requirements 1.1-1.6: 주문 생성
- ✓ Requirements 2.1-2.6: 결제 요청
- ✓ Requirements 3.1-3.6: 결제 승인
- ✓ Requirements 4.1-4.6: 결제 실패 처리
- ✓ Requirements 5.1-5.6: 결제 취소
- ✓ Requirements 6.1-6.6: 입력 검증 및 Injection 방지
- ✓ Requirements 7.1-7.5: 트랜잭션 안전성
- ✓ Requirements 8.1-8.6: 민감정보 보호
- ✓ Requirements 9.1-9.5: Idempotency
- ✓ Requirements 10.1-10.6: 로그 마스킹
- ✓ Requirements 11.1-11.5: 암호화

## 추가 테스트 권장사항

향후 추가할 수 있는 테스트:

1. **성능 테스트**
   - 동시 결제 요청 처리
   - 대량 주문 생성

2. **부하 테스트**
   - 초당 요청 수 (RPS) 측정
   - 응답 시간 측정

3. **엔드투엔드 테스트**
   - 실제 결제 게이트웨이 연동
   - 전체 시스템 통합 테스트

4. **보안 침투 테스트**
   - OWASP Top 10 검증
   - 자동화된 보안 스캔
