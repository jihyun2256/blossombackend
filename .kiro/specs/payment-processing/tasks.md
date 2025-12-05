# Implementation Plan

- [x] 1. 데이터베이스 스키마 및 초기화 설정





  - payments, refunds, payment_logs 테이블 생성 스크립트 작성
  - 데이터베이스 마이그레이션 유틸리티 구현
  - 인덱스 및 외래 키 제약 조건 설정
  - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [x] 1.1 데이터베이스 초기화 테스트 작성


  - **Property 테스트는 아니지만 스키마 검증을 위한 예제 테스트**
  - _Requirements: 7.1, 7.3_
-

- [x] 2. 공유 유틸리티 및 미들웨어 구현




  - 입력 검증 유틸리티 함수 작성 (validatePayment, validateRefund)
  - 카드 번호 마스킹 함수 구현
  - SQL 인젝션 방지를 위한 쿼리 헬퍼 작성
  - 요청 크기 제한 미들웨어 구현
  - _Requirements: 1.3, 1.4, 2.4, 8.1, 8.3_

- [x] 2.1 입력 검증 property 테스트 작성


  - **Property 2: Invalid payment rejection**
  - **Validates: Requirements 1.3**

- [x] 2.2 금액 검증 property 테스트 작성


  - **Property 3: Non-positive amount rejection**
  - **Validates: Requirements 1.4**

- [x] 2.3 카드 마스킹 property 테스트 작성


  - **Property 7: Card number masking**
  - **Validates: Requirements 2.4, 3.4, 8.2**

- [x] 2.4 SQL 인젝션 방지 property 테스트 작성


  - **Property 14: SQL injection protection**
  - **Validates: Requirements 8.1**

- [x] 2.5 요청 크기 제한 property 테스트 작성


  - **Property 15: Request size limitation**
  - **Validates: Requirements 8.3**

- [x] 2.6 유틸리티 함수 단위 테스트 작성


  - 카드 마스킹 함수 단위 테스트
  - 입력 검증 함수 단위 테스트
  - _Requirements: 1.3, 1.4, 2.4_
-

- [x] 3. 인증 및 권한 미들웨어 구현




  - JWT 토큰 검증 미들웨어 작성 (authenticateToken)
  - 관리자 권한 확인 미들웨어 작성 (requireAdmin)
  - 사용자 소유권 검증 미들웨어 작성 (checkPaymentOwnership)
  - _Requirements: 9.1, 9.2, 9.3, 9.4_

- [x] 3.1 인증 검증 property 테스트 작성


  - **Property 17: Authentication requirement**
  - **Validates: Requirements 9.1, 9.3**



- [x] 3.2 관리자 권한 property 테스트 작성


  - **Property 18: Admin authorization for refunds**
  - **Validates: Requirements 9.2**


- [x] 3.3 사용자 격리 property 테스트 작성


  - **Property 19: User isolation**
  - **Validates: Requirements 9.4**

- [x] 3.4 인증 미들웨어 단위 테스트 작성

  - JWT 검증 단위 테스트
  - 권한 확인 단위 테스트
  - _Requirements: 9.1, 9.2, 9.4_

- [x] 4. 로깅 시스템 구현





  - 구조화된 로거 설정 (Winston 또는 Pino)
  - 민감 정보 마스킹 로깅 유틸리티 작성
  - 보안 이벤트 로거 구현
  - 데이터베이스 로그 저장 함수 작성 (payment_logs 테이블)
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

- [x] 4.1 결제 생성 로깅 property 테스트 작성


  - **Property 20: Payment creation logging**
  - **Validates: Requirements 10.1**

- [x] 4.2 상태 변경 로깅 property 테스트 작성

  - **Property 21: Status change logging**
  - **Validates: Requirements 10.2**

- [x] 4.3 보안 이벤트 로깅 property 테스트 작성

  - **Property 22: Security event logging**
  - **Validates: Requirements 10.3**

- [x] 4.4 로그 마스킹 property 테스트 작성

  - **Property 23: Log data masking**
  - **Validates: Requirements 10.4**

- [x] 4.5 데이터베이스 오류 로깅 property 테스트 작성

  - **Property 24: Database error logging**
  - **Validates: Requirements 10.5**

- [x] 4.6 로깅 유틸리티 단위 테스트 작성

  - 마스킹 함수 단위 테스트
  - 로그 포맷팅 단위 테스트
  - _Requirements: 10.4_

- [x] 5. Payment Repository 레이어 구현





  - PaymentRepository 클래스 생성
  - create() 메서드 구현 (파라미터화된 쿼리 사용)
  - findById() 메서드 구현
  - findByOrderId() 메서드 구현
  - update() 메서드 구현
  - createRefund() 메서드 구현
  - getRefundsByPaymentId() 메서드 구현
  - _Requirements: 1.1, 2.1, 3.1, 3.2, 5.1, 5.2_

- [x] 5.1 결제 생성 round-trip property 테스트 작성


  - **Property 1: Payment creation round-trip**
  - **Validates: Requirements 1.1, 1.2, 3.1**

- [x] 5.2 즉시 영속성 property 테스트 작성

  - **Property 5: Immediate persistence**
  - **Validates: Requirements 2.1**

- [x] 5.3 자동 타임스탬프 property 테스트 작성

  - **Property 6: Automatic timestamps**
  - **Validates: Requirements 2.3, 7.4**

- [x] 5.4 주문 기반 조회 property 테스트 작성

  - **Property 8: Order-based payment retrieval**
  - **Validates: Requirements 3.2**

- [x] 5.5 자동 증가 ID property 테스트 작성

  - **Property 13: Auto-incrementing payment IDs**
  - **Validates: Requirements 7.2**

- [x] 5.6 Repository 단위 테스트 작성

  - CRUD 작업 단위 테스트
  - 존재하지 않는 ID 조회 테스트
  - _Requirements: 1.1, 3.1, 3.2, 3.3_
-

- [x] 6. Payment Service 레이어 구현




  - PaymentService 클래스 생성
  - createPayment() 메서드 구현 (검증 + 로깅 포함)
  - getPaymentById() 메서드 구현
  - getPaymentsByOrderId() 메서드 구현
  - processPayment() 메서드 구현 (상태 업데이트)
  - updatePaymentStatus() 메서드 구현
  - 트랜잭션 관리 로직 추가
  - _Requirements: 1.1, 1.2, 1.5, 3.1, 3.2, 4.1, 4.2_

- [x] 6.1 결제 완료 상태 업데이트 property 테스트 작성


  - **Property 4: Payment completion updates status**
  - **Validates: Requirements 1.5**

- [x] 6.2 결제 실패 기록 property 테스트 작성


  - **Property 9: Payment failure recording**
  - **Validates: Requirements 4.1, 4.2**

- [x] 6.3 Service 레이어 단위 테스트 작성


  - 비즈니스 로직 단위 테스트
  - 상태 전환 테스트
  - _Requirements: 1.5, 4.1, 4.2_

- [x] 7. 환불 기능 구현





  - refundPayment() 메서드를 PaymentService에 추가
  - 환불 금액 검증 로직 구현
  - 중복 환불 방지 로직 구현
  - 환불 트랜잭션 생성 및 원본 결제 상태 업데이트
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 7.1 환불 생성 및 상태 업데이트 property 테스트 작성


  - **Property 10: Refund creates transaction and updates status**
  - **Validates: Requirements 5.1, 5.2**

- [x] 7.2 중복 환불 방지 property 테스트 작성


  - **Property 11: Duplicate refund prevention**
  - **Validates: Requirements 5.3**

- [x] 7.3 환불 금액 검증 property 테스트 작성


  - **Property 12: Refund amount validation**
  - **Validates: Requirements 5.4**

- [x] 7.4 환불 기능 단위 테스트 작성


  - 환불 검증 로직 단위 테스트
  - 환불 상태 전환 테스트
  - _Requirements: 5.1, 5.3, 5.4_

- [x] 8. 오류 처리 및 보안 강화





  - 전역 오류 핸들러 개선 (민감 정보 제거)
  - 오류 응답 포맷터 구현
  - 데이터베이스 연결 오류 처리 로직 추가
  - 트랜잭션 롤백 메커니즘 구현
  - _Requirements: 2.2, 6.1, 6.2, 6.3, 8.5_

- [x] 8.1 오류 응답 보안 property 테스트 작성


  - **Property 16: Sensitive information exclusion from errors**
  - **Validates: Requirements 8.5**

- [x] 8.2 오류 처리 단위 테스트 작성


  - 오류 포맷팅 단위 테스트
  - 트랜잭션 롤백 테스트
  - _Requirements: 2.2, 8.5_

- [x] 9. Payment Routes 구현





  - POST /payments 엔드포인트 구현
  - GET /payments/:id 엔드포인트 구현
  - GET /payments/order/:orderId 엔드포인트 구현
  - POST /payments/:id/refund 엔드포인트 구현
  - GET /payments/:id/status 엔드포인트 구현
  - 모든 엔드포인트에 인증/권한 미들웨어 적용
  - _Requirements: 1.1, 3.1, 3.2, 5.1, 9.1, 9.2_

- [x] 9.1 API 엔드포인트 통합 테스트 작성


  - 전체 요청/응답 흐름 테스트
  - 인증/권한 통합 테스트
  - _Requirements: 1.1, 3.1, 5.1, 9.1, 9.2_

- [x] 10. 환경 설정 및 배포 준비





  - 환경 변수 설정 문서화 (.env.example)
  - 데이터베이스 연결 설정 검증
  - package.json 의존성 업데이트 (fast-check, winston/pino, jsonwebtoken)
  - 시작 스크립트에 데이터베이스 초기화 추가
  - _Requirements: 6.4, 8.4_

- [ ] 11. Checkpoint - 모든 테스트 통과 확인
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. 문서화 및 최종 검토





  - API 엔드포인트 문서 작성
  - 환경 변수 설정 가이드 작성
  - 보안 체크리스트 검토
