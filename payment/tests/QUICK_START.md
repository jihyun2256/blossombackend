# Quick Start - Payment API Tests

## 빠른 시작 가이드

### 1️⃣ 보안 검증 테스트 (1분)

서버 없이 바로 실행 가능:

```bash
cd payment
npm run test:security
```

**예상 결과:**
```
✓ 모든 보안 검증을 통과했습니다!
통과: 57
실패: 0
```

---

### 2️⃣ 통합 테스트 (5분)

#### Step 1: 데이터베이스 준비 (최초 1회)
```bash
cd payment
npm run db:init
npm run db:migrate
```

#### Step 2: 서버 시작 (터미널 1)
```bash
cd payment
npm start
```

#### Step 3: 테스트 실행 (터미널 2)
```bash
cd payment
npm run test:integration
```

**예상 결과:**
```
✓ 모든 통합 테스트를 통과했습니다!
총 테스트: 20+
통과: 20+
실패: 0
통과율: 100%
```

---

## 테스트 내용

### 보안 검증 (security-verification.js)
- ✓ SQL Injection 방어
- ✓ 민감정보 저장 방지
- ✓ 트랜잭션 안전성
- ✓ 로그 마스킹
- ✓ Idempotency 구현

### 통합 테스트 (integration.test.js)
1. ✓ 주문 생성 → 결제 → 승인 플로우
2. ✓ 결제 실패 시나리오
3. ✓ 결제 취소 시나리오
4. ✓ SQL Injection 공격 차단
5. ✓ 중복 결제 방지
6. ✓ 입력 검증

---

## 문제 해결

### "Cannot find module"
```bash
cd payment
npm install
```

### "ER_NO_SUCH_TABLE"
```bash
cd payment
npm run db:init
npm run db:migrate
```

### "fetch failed"
- 서버가 실행 중인지 확인: `curl http://localhost:3004/health`
- 포트 3004가 사용 가능한지 확인

---

## 환경 변수 (.env)

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=ecommerce
JWT_SECRET=your_jwt_secret
ENCRYPTION_KEY=your_32_character_encryption_key
ENCRYPTION_IV=your_16_character_iv
PORT=3004
```

---

## 더 자세한 정보

- 📖 [전체 테스트 문서](./README.md)
- 🚀 [테스트 실행 가이드](./test-runner.md)
- 📊 [테스트 요약](./TEST_SUMMARY.md)
- 🔒 [보안 가이드](../SECURITY_GUIDE.md)

---

## 한 줄 명령어

### 전체 테스트 (보안 + 통합)
```bash
cd payment && npm run test:security && (npm start &) && sleep 3 && npm run test:integration
```

### 보안 테스트만
```bash
cd payment && npm run test:security
```

### 통합 테스트만 (서버 실행 중)
```bash
cd payment && npm run test:integration
```

---

**✅ Task 8.6 완료 - 통합 테스트 작성**

모든 테스트 시나리오가 구현되었습니다!
