# Design Document

## Overview

이 디자인은 기존 Node.js 마이크로서비스 아키텍처에 Aurora MySQL 데이터베이스를 사용하는 완전한 결제 처리 시스템을 추가합니다. 시스템은 결제 생성, 처리, 조회, 환불 기능을 제공하며, 보안과 데이터 무결성을 최우선으로 고려합니다.

**핵심 설계 원칙:**
- 보안 우선: SQL 인젝션 방지, 데이터 암호화, 인증/권한 검증
- 데이터 무결성: 트랜잭션 관리, 롤백 메커니즘
- 확장성: 연결 풀링, 인덱싱 최적화
- 감사 가능성: 포괄적인 로깅 및 이력 추적

## Architecture

### System Components

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │ HTTPS
       ▼
┌─────────────────────────────────┐
│     payments-api (Express)      │
│  ┌──────────────────────────┐   │
│  │  Authentication Middleware│   │
│  └──────────────────────────┘   │
│  ┌──────────────────────────┐   │
│  │   Payment Routes         │   │
│  └──────────────────────────┘   │
│  ┌──────────────────────────┐   │
│  │   Payment Service        │   │
│  └──────────────────────────┘   │
│  ┌──────────────────────────┐   │
│  │   Payment Repository     │   │
│  └──────────────────────────┘   │
└────────────┬────────────────────┘
             │
             ▼
      ┌─────────────┐
      │  Aurora DB  │
      │   (MySQL)   │
      └─────────────┘
```

### Layer Responsibilities

1. **Routes Layer** (`routes/payments.js`)
   - HTTP 요청/응답 처리
   - 입력 검증
   - 인증/권한 확인
   - 오류 응답 포맷팅

2. **Service Layer** (`services/paymentService.js`)
   - 비즈니스 로직 구현
   - 결제 상태 관리
   - 트랜잭션 조율
   - 환불 처리 로직

3. **Repository Layer** (`repositories/paymentRepository.js`)
   - 데이터베이스 CRUD 작업
   - SQL 쿼리 실행
   - 연결 관리

4. **Middleware Layer** (`middleware/auth.js`)
   - JWT 토큰 검증
   - 사용자 권한 확인
   - 요청 크기 제한

## Components and Interfaces

### 1. Payment Routes

**Endpoints:**

```javascript
POST   /payments              // 새 결제 생성
GET    /payments/:id          // 결제 조회 (ID로)
GET    /payments/order/:orderId  // 주문의 모든 결제 조회
POST   /payments/:id/refund   // 환불 처리
GET    /payments/:id/status   // 결제 상태 조회
```

**Request/Response Schemas:**

```javascript
// POST /payments
Request: {
  order_id: string (required),
  amount: number (required, > 0),
  payment_method: string (required, enum: ['card', 'bank', 'wallet']),
  card_last4: string (optional, 4 digits),
  user_id: string (required)
}

Response: {
  success: boolean,
  payment_id: number,
  status: string,
  created_at: timestamp
}

// POST /payments/:id/refund
Request: {
  amount: number (required, > 0),
  reason: string (required)
}

Response: {
  success: boolean,
  refund_id: number,
  refunded_amount: number,
  refunded_at: timestamp
}
```

### 2. Payment Service

**Interface:**

```javascript
class PaymentService {
  async createPayment(paymentData)
  async getPaymentById(paymentId)
  async getPaymentsByOrderId(orderId)
  async processPayment(paymentId)
  async refundPayment(paymentId, amount, reason)
  async updatePaymentStatus(paymentId, status, errorMessage)
}
```

### 3. Payment Repository

**Interface:**

```javascript
class PaymentRepository {
  async create(paymentData)
  async findById(paymentId)
  async findByOrderId(orderId)
  async update(paymentId, updates)
  async createRefund(refundData)
  async getRefundsByPaymentId(paymentId)
}
```

### 4. Authentication Middleware

**Interface:**

```javascript
// JWT 토큰 검증
async function authenticateToken(req, res, next)

// 관리자 권한 확인
async function requireAdmin(req, res, next)

// 요청 크기 제한
function limitRequestSize(maxSize)
```

## Data Models

### Database Schema

**payments 테이블:**

```sql
CREATE TABLE payments (
  payment_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  order_id VARCHAR(100) NOT NULL,
  user_id VARCHAR(100) NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  payment_method ENUM('card', 'bank', 'wallet') NOT NULL,
  card_last4 VARCHAR(4),
  status ENUM('pending', 'processing', 'completed', 'failed', 'refunded') DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL,
  
  INDEX idx_order_id (order_id),
  INDEX idx_user_id (user_id),
  INDEX idx_status (status),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

**refunds 테이블:**

```sql
CREATE TABLE refunds (
  refund_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  payment_id BIGINT NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  reason TEXT NOT NULL,
  status ENUM('pending', 'completed', 'failed') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL,
  
  FOREIGN KEY (payment_id) REFERENCES payments(payment_id),
  INDEX idx_payment_id (payment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

**payment_logs 테이블 (감사 로그):**

```sql
CREATE TABLE payment_logs (
  log_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  payment_id BIGINT,
  action VARCHAR(50) NOT NULL,
  user_id VARCHAR(100),
  details JSON,
  ip_address VARCHAR(45),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_payment_id (payment_id),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### Data Models (JavaScript)

```javascript
// Payment Model
{
  payment_id: number,
  order_id: string,
  user_id: string,
  amount: number,
  payment_method: 'card' | 'bank' | 'wallet',
  card_last4: string | null,
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'refunded',
  error_message: string | null,
  created_at: Date,
  updated_at: Date,
  completed_at: Date | null
}

// Refund Model
{
  refund_id: number,
  payment_id: number,
  amount: number,
  reason: string,
  status: 'pending' | 'completed' | 'failed',
  created_at: Date,
  completed_at: Date | null
}
```


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Payment creation round-trip
*For any* valid payment data (order_id, amount, payment_method, user_id), creating a payment and then retrieving it by payment_id should return equivalent payment data with status 'pending' and a unique payment_id.
**Validates: Requirements 1.1, 1.2, 3.1**

### Property 2: Invalid payment rejection
*For any* payment request missing required fields (order_id, amount, payment_method, or user_id), the system should reject the request with a clear error message.
**Validates: Requirements 1.3**

### Property 3: Non-positive amount rejection
*For any* payment request with amount ≤ 0, the system should reject the request.
**Validates: Requirements 1.4**

### Property 4: Payment completion updates status
*For any* payment in 'pending' or 'processing' status, successfully processing it should update the status to 'completed' and record a completed_at timestamp.
**Validates: Requirements 1.5**

### Property 5: Immediate persistence
*For any* payment creation or update operation, immediately querying the database should reflect the changes.
**Validates: Requirements 2.1**

### Property 6: Automatic timestamps
*For any* payment creation, the system should automatically set created_at and updated_at timestamps without explicit input.
**Validates: Requirements 2.3, 7.4**

### Property 7: Card number masking
*For any* payment with full card number provided, only the last 4 digits should be stored in the database, and full card numbers should never appear in query results.
**Validates: Requirements 2.4, 3.4, 8.2**

### Property 8: Order-based payment retrieval
*For any* order_id with multiple payments, querying by order_id should return all payments associated with that order.
**Validates: Requirements 3.2**

### Property 9: Payment failure recording
*For any* payment that fails during processing, the system should update status to 'failed', record an error_message, and return a clear error response with error code.
**Validates: Requirements 4.1, 4.2**

### Property 10: Refund creates transaction and updates status
*For any* completed payment, requesting a refund should create a refund record in the database, update the payment status to 'refunded', and record refund amount, reason, and timestamp.
**Validates: Requirements 5.1, 5.2**

### Property 11: Duplicate refund prevention
*For any* payment already in 'refunded' status, attempting another refund should be rejected with an error.
**Validates: Requirements 5.3**

### Property 12: Refund amount validation
*For any* refund request, the refund amount should not exceed the original payment amount.
**Validates: Requirements 5.4**

### Property 13: Auto-incrementing payment IDs
*For any* sequence of payment creations, each payment_id should be unique and greater than the previous payment_id.
**Validates: Requirements 7.2**

### Property 14: SQL injection protection
*For any* payment request containing SQL injection patterns (e.g., `'; DROP TABLE--`, `' OR '1'='1`), the system should safely handle the input without executing malicious SQL.
**Validates: Requirements 8.1**

### Property 15: Request size limitation
*For any* payment request with body size exceeding the configured limit, the system should reject the request with 413 status code.
**Validates: Requirements 8.3**

### Property 16: Sensitive information exclusion from errors
*For any* error response, the response should not contain sensitive information such as database credentials, connection strings, or full stack traces.
**Validates: Requirements 8.5**

### Property 17: Authentication requirement
*For any* payment creation request without a valid authentication token, the system should reject the request with 401 status code.
**Validates: Requirements 9.1, 9.3**

### Property 18: Admin authorization for refunds
*For any* refund request from a non-admin user, the system should reject the request with 403 status code.
**Validates: Requirements 9.2**

### Property 19: User isolation
*For any* user attempting to access another user's payment information, the system should reject the request with 403 status code.
**Validates: Requirements 9.4**

### Property 20: Payment creation logging
*For any* payment creation, the system should create a log entry containing user_id, timestamp, action type, and request details (with sensitive data masked).
**Validates: Requirements 10.1**

### Property 21: Status change logging
*For any* payment status change, the system should create a log entry recording the old status, new status, and timestamp.
**Validates: Requirements 10.2**

### Property 22: Security event logging
*For any* authentication failure or authorization denial, the system should create a separate security log entry.
**Validates: Requirements 10.3**

### Property 23: Log data masking
*For any* log entry containing payment data, sensitive information (full card numbers, passwords) should be masked (e.g., card number shown as ****1234).
**Validates: Requirements 10.4**

### Property 24: Database error logging
*For any* database operation failure, the system should log error details including error type, query context, and timestamp.
**Validates: Requirements 10.5**

## Error Handling

### Error Categories

1. **Validation Errors (400)**
   - Missing required fields
   - Invalid data types
   - Invalid amount (≤ 0)
   - Invalid payment method
   - Refund amount exceeds original

2. **Authentication Errors (401)**
   - Missing authentication token
   - Invalid token
   - Expired token

3. **Authorization Errors (403)**
   - Non-admin attempting refund
   - User accessing another user's payment

4. **Not Found Errors (404)**
   - Payment ID not found
   - Order ID has no payments

5. **Conflict Errors (409)**
   - Duplicate refund attempt
   - Invalid status transition

6. **Payload Too Large (413)**
   - Request body exceeds size limit

7. **Server Errors (500)**
   - Database connection failure
   - Unexpected errors

8. **Service Unavailable (503)**
   - Database timeout
   - Connection pool exhausted

### Error Response Format

```javascript
{
  success: false,
  error: {
    code: 'ERROR_CODE',
    message: 'Human-readable error message',
    details: {} // Optional additional context
  }
}
```

### Error Handling Strategy

1. **Input Validation**: Validate all inputs before database operations
2. **Transaction Management**: Use database transactions for multi-step operations
3. **Rollback on Failure**: Automatically rollback transactions on any error
4. **Secure Error Messages**: Never expose sensitive information in error responses
5. **Comprehensive Logging**: Log all errors with context for debugging
6. **Graceful Degradation**: Return appropriate HTTP status codes

## Testing Strategy

### Unit Testing

**Framework**: Jest (Node.js standard testing framework)

**Unit Test Coverage:**
- Input validation functions
- Data transformation utilities (card masking, data sanitization)
- Error message formatting
- Authentication/authorization middleware
- Logging utilities

**Example Unit Tests:**
```javascript
describe('Payment Validation', () => {
  test('should reject payment with missing order_id', () => {
    const invalidPayment = { amount: 100, payment_method: 'card' };
    expect(() => validatePayment(invalidPayment)).toThrow('order_id is required');
  });
  
  test('should mask card number correctly', () => {
    const cardNumber = '1234567812345678';
    expect(maskCardNumber(cardNumber)).toBe('****5678');
  });
});
```

### Property-Based Testing

**Framework**: fast-check (JavaScript property-based testing library)

**Configuration:**
- Minimum 100 iterations per property test
- Each property test must reference its corresponding design property using the format: `**Feature: payment-processing, Property {number}: {property_text}**`

**Property Test Coverage:**
- All 24 correctness properties defined above
- Each property implemented as a single property-based test
- Tests should generate random valid/invalid inputs to verify properties hold across all cases

**Example Property Test:**
```javascript
const fc = require('fast-check');

describe('Payment Properties', () => {
  test('Property 1: Payment creation round-trip', async () => {
    // **Feature: payment-processing, Property 1: Payment creation round-trip**
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          order_id: fc.string({ minLength: 1 }),
          amount: fc.float({ min: 0.01, max: 999999 }),
          payment_method: fc.constantFrom('card', 'bank', 'wallet'),
          user_id: fc.string({ minLength: 1 })
        }),
        async (paymentData) => {
          const created = await paymentService.createPayment(paymentData);
          const retrieved = await paymentService.getPaymentById(created.payment_id);
          
          expect(retrieved.order_id).toBe(paymentData.order_id);
          expect(retrieved.amount).toBe(paymentData.amount);
          expect(retrieved.status).toBe('pending');
          expect(retrieved.payment_id).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});
```

### Integration Testing

**Scope:**
- End-to-end API endpoint testing
- Database transaction integrity
- Authentication/authorization flow
- Error handling across layers

**Test Database:**
- Use separate test Aurora instance or local MySQL
- Reset database state between tests
- Use transactions to isolate tests

### Security Testing

**Focus Areas:**
- SQL injection attempts
- Authentication bypass attempts
- Authorization violations
- Sensitive data exposure
- Request size attacks

### Performance Testing

**Metrics:**
- Response time for payment creation (< 200ms)
- Response time for payment retrieval (< 100ms)
- Database connection pool efficiency
- Concurrent request handling

## Implementation Notes

### Security Best Practices

1. **Parameterized Queries**: Always use prepared statements
2. **Environment Variables**: Store all credentials in environment variables
3. **Token Validation**: Verify JWT tokens on every protected endpoint
4. **Rate Limiting**: Implement rate limiting to prevent abuse
5. **HTTPS Only**: Enforce HTTPS in production
6. **Audit Logging**: Log all payment operations for compliance

### Database Optimization

1. **Indexes**: Create indexes on frequently queried columns (order_id, user_id, status)
2. **Connection Pooling**: Reuse database connections efficiently
3. **Query Optimization**: Use EXPLAIN to optimize slow queries
4. **Transaction Isolation**: Use appropriate isolation levels

### Monitoring and Observability

1. **Metrics**: Track payment success/failure rates, response times
2. **Alerts**: Set up alerts for high error rates, slow queries
3. **Logging**: Structured logging with correlation IDs
4. **Tracing**: Implement distributed tracing for debugging

### Scalability Considerations

1. **Stateless Design**: Keep API stateless for horizontal scaling
2. **Database Read Replicas**: Use read replicas for query operations
3. **Caching**: Cache frequently accessed payment data
4. **Async Processing**: Consider async processing for heavy operations
