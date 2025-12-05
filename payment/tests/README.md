# Payment API Tests

이 디렉토리는 Payment API의 테스트 파일들을 포함합니다.

## 테스트 종류

### 1. Security Verification Tests (`security-verification.js`)
보안 강화 및 최종 검증을 위한 정적 코드 분석 테스트입니다.

**검증 항목:**
- SQL Injection 방어
- 민감정보 저장 방지
- 트랜잭션 안전성
- 로그 마스킹
- Idempotency 구현

**실행 방법:**
```bash
node tests/security-verification.js
```

### 2. Integration Tests (`integration.test.js`)
전체 API 플로우를 검증하는 통합 테스트입니다.

**테스트 시나리오:**
1. 주문 생성 → 결제 → 승인 전체 플로우
2. 결제 실패 시나리오
3. 결제 취소 시나리오
4. SQL Injection 공격 시도
5. 중복 결제 방지 (Idempotency)
6. 입력 검증

**실행 방법:**

1. **서버 시작** (별도 터미널):
```bash
cd payment
npm start
```

2. **테스트 실행** (다른 터미널):
```bash
cd payment
node tests/integration.test.js
```

**환경 변수 설정:**
```bash
# 기본값: http://localhost:3004
export API_BASE_URL=http://localhost:3004

# 또는 Windows에서:
set API_BASE_URL=http://localhost:3004
```

## 테스트 전 준비사항

### 1. 데이터베이스 설정
```bash
# 데이터베이스 초기화
npm run db:init

# 테이블 마이그레이션
npm run db:migrate
```

### 2. 환경 변수 설정
`.env` 파일을 생성하고 다음 변수들을 설정하세요:
```
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=ecommerce
JWT_SECRET=your_jwt_secret
ENCRYPTION_KEY=your_32_character_encryption_key
ENCRYPTION_IV=your_16_character_iv
PORT=3004
```

### 3. 의존성 설치
```bash
npm install
```

## 테스트 결과 해석

### Security Verification Tests
- ✓ (녹색): 검증 통과
- ✗ (빨간색): 검증 실패 - 수정 필요
- ⚠ (노란색): 경고 - 검토 권장

### Integration Tests
- ✓ (녹색): 테스트 통과
- ✗ (빨간색): 테스트 실패
- 통과율 80% 이상 권장

## 테스트 데이터

### 테스트 사용자
- User ID: 9999

### 테스트 상품
- Product ID: 1, 2, 3

### Idempotency Keys
- UUID v4 형식 자동 생성

## 문제 해결

### 서버 연결 실패
```
Error: fetch failed
```
- 서버가 실행 중인지 확인
- API_BASE_URL이 올바른지 확인
- 포트 충돌 확인

### 데이터베이스 오류
```
Error: ER_NO_SUCH_TABLE
```
- 데이터베이스 초기화 실행: `npm run db:init`
- 마이그레이션 실행: `npm run db:migrate`

### 인증 오류
```
Error: Unauthorized
```
- JWT_SECRET 환경 변수 확인
- 인증 미들웨어 설정 확인

## CI/CD 통합

### GitHub Actions 예시
```yaml
- name: Run Security Tests
  run: |
    cd payment
    node tests/security-verification.js

- name: Start Server
  run: |
    cd payment
    npm start &
    sleep 5

- name: Run Integration Tests
  run: |
    cd payment
    node tests/integration.test.js
```

## 추가 테스트 작성 가이드

새로운 통합 테스트를 추가할 때:

1. `integration.test.js`에 새 함수 추가
2. `logSection()`으로 테스트 섹션 시작
3. `logTest()`로 개별 테스트 시작
4. `logPass()` 또는 `logFail()`로 결과 기록
5. `main()` 함수에서 새 테스트 함수 호출

```javascript
async function testNewFeature() {
  logSection('테스트 N: 새 기능');
  
  try {
    logTest('N.1 테스트 케이스 설명');
    // 테스트 코드
    logPass('테스트 통과');
  } catch (error) {
    logFail('테스트 실패', error);
  }
}
```

## 참고 문서

- [Requirements Document](../.kiro/specs/payment-system-api/requirements.md)
- [Design Document](../.kiro/specs/payment-system-api/design.md)
- [Security Guide](../SECURITY_GUIDE.md)
- [Security Report](../SECURITY_REPORT.md)
