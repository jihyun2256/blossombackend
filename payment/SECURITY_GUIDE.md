# Payment System API - Security Implementation Guide

This guide provides quick reference for the security features implemented in the Payment System API.

---

## 🛡️ Security Features Overview

### 1. SQL Injection Prevention

**What it does:** Prevents malicious SQL code injection through user inputs.

**Implementation:**
- All queries use parameterized statements
- Input validation before database operations
- SQL injection pattern detection

**Example:**
```javascript
// ✅ SAFE - Parameterized query
await connection.execute(
  'SELECT * FROM payments WHERE payment_id = ?',
  [paymentId]
);

// ❌ UNSAFE - Never do this
await connection.execute(
  `SELECT * FROM payments WHERE payment_id = '${paymentId}'`
);
```

**Validator Function:**
```javascript
import { detectSQLInjection } from './utils/validator.js';

if (detectSQLInjection(userInput)) {
  throw new Error('Invalid input detected');
}
```

---

### 2. Sensitive Data Protection

**What it does:** Ensures sensitive payment information is never stored in the database.

**Protected Data (NEVER stored):**
- ❌ Credit card numbers
- ❌ CVV/CVC codes
- ❌ API keys and secrets
- ❌ Raw payment credentials

**What IS stored:**
- ✅ Payment gateway transaction IDs (tokens)
- ✅ Payment status and metadata
- ✅ Order references

**Code Example:**
```javascript
// ✅ CORRECT - Store only token
await connection.execute(
  'INSERT INTO payments (payment_id, transaction_id, status) VALUES (?, ?, ?)',
  [paymentId, gatewayTransactionId, 'completed']
);

// ❌ WRONG - Never store raw card data
// await connection.execute(
//   'INSERT INTO payments (card_number, cvv) VALUES (?, ?)',
//   [cardNumber, cvv]
// );
```

---

### 3. Transaction Safety

**What it does:** Ensures data consistency by wrapping operations in database transactions.

**Pattern:**
```javascript
let connection;
try {
  // 1. Get connection and start transaction
  connection = await db.getConnection();
  await connection.beginTransaction();
  
  // 2. Perform database operations
  await createPayment(connection);
  await updateOrder(connection);
  
  // 3. Commit if all successful
  await connection.commit();
  
} catch (error) {
  // 4. Rollback on any error
  if (connection) {
    await connection.rollback();
  }
  throw error;
  
} finally {
  // 5. Always release connection
  if (connection) {
    connection.release();
  }
}
```

**Key Points:**
- ✅ All payment operations use transactions
- ✅ Automatic rollback on errors
- ✅ Connection always released in finally block

---

### 4. Log Masking

**What it does:** Automatically masks sensitive information in all log outputs.

**Masking Rules:**

| Data Type | Masking Pattern | Example |
|-----------|----------------|---------|
| Card Number | Last 4 digits only | `****-****-****-1234` |
| Email | First char + domain | `u***@example.com` |
| Phone | Last 4 digits only | `***-****-1234` |
| CVV/Password | Complete removal | `[REDACTED]` |
| API Keys | Complete removal | `[REDACTED]` |

**Usage:**
```javascript
import { logInfo, logError, logPayment } from './utils/logger.js';

// Automatically masks sensitive data
logInfo('Payment processed', {
  card_number: '4532-1234-5678-9010',  // Logged as: ****-****-****-9010
  email: 'user@example.com',            // Logged as: u***@example.com
  cvv: '123',                           // Logged as: [REDACTED]
  amount: 100.00                        // Logged as: 100.00
});

// Special payment logging
logPayment({
  payment_id: 'PAY_123',
  transaction_id: 'TXN_ABCD1234EFGH',  // Partially masked
  status: 'completed'
});
```

**Manual Masking:**
```javascript
import { maskSensitiveData } from './utils/logger.js';

const userData = {
  name: 'John Doe',
  email: 'john@example.com',
  card: '4532123456789010'
};

const masked = maskSensitiveData(userData);
// Result: { name: 'John Doe', email: 'j***@example.com', card: '****-****-****-9010' }
```

---

### 5. Idempotency System

**What it does:** Prevents duplicate payment processing from repeated requests.

**How it works:**
1. Client generates unique `idempotency_key` (UUID v4)
2. Server checks if key was used before
3. If duplicate: Return cached response (no charge)
4. If new: Process payment and cache response
5. Keys expire after 24 hours

**Client Implementation:**
```javascript
import { v4 as uuidv4 } from 'uuid';

// Generate unique key for each payment attempt
const idempotencyKey = uuidv4();

const response = await fetch('/payments', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    order_id: 123,
    payment_method: 'card',
    idempotency_key: idempotencyKey  // Required!
  })
});
```

**Server-Side (Automatic):**
```javascript
// Middleware automatically handles idempotency
router.post('/payments', 
  idempotencyMiddleware,  // Checks for duplicates
  validatePaymentRequest,
  async (req, res) => {
    // Your payment logic here
  }
);
```

**Benefits:**
- ✅ Prevents double-charging customers
- ✅ Safe to retry failed requests
- ✅ Automatic duplicate detection
- ✅ 24-hour protection window

---

### 6. Encryption

**What it does:** Encrypts sensitive data using AES-256 encryption.

**Setup:**
```bash
# .env file
ENCRYPTION_KEY=your-32-character-secret-key!!
ENCRYPTION_IV=your-16-char-iv!
```

**Usage:**
```javascript
import { encrypt, decrypt } from './utils/encryption.js';

// Encrypt sensitive data
const encrypted = encrypt('sensitive-data');
// Store encrypted value in database

// Decrypt when needed
const decrypted = decrypt(encrypted);
```

**Hashing:**
```javascript
import { hashRequestData, hashIdempotencyKey } from './utils/encryption.js';

// Hash request data for comparison
const hash = hashRequestData({ order_id: 123, amount: 100 });

// Hash idempotency key
const keyHash = hashIdempotencyKey('uuid-v4-key');
```

---

## 🔒 Security Best Practices

### For Developers

1. **Always use parameterized queries**
   ```javascript
   // ✅ Good
   db.execute('SELECT * FROM users WHERE id = ?', [userId]);
   
   // ❌ Bad
   db.execute(`SELECT * FROM users WHERE id = ${userId}`);
   ```

2. **Never log sensitive data directly**
   ```javascript
   // ✅ Good
   logInfo('User logged in', { email: user.email }); // Auto-masked
   
   // ❌ Bad
   console.log('Card:', cardNumber); // Not masked!
   ```

3. **Always use transactions for multi-step operations**
   ```javascript
   // ✅ Good
   const connection = await db.getConnection();
   await connection.beginTransaction();
   try {
     await step1(connection);
     await step2(connection);
     await connection.commit();
   } catch (error) {
     await connection.rollback();
   } finally {
     connection.release();
   }
   ```

4. **Validate all inputs**
   ```javascript
   import { isValidAmount, isValidUserId } from './utils/validator.js';
   
   if (!isValidAmount(amount)) {
     throw new Error('Invalid amount');
   }
   ```

5. **Use idempotency keys for all payment operations**
   ```javascript
   // Client must provide idempotency_key
   if (!req.body.idempotency_key) {
     return res.status(400).json({ error: 'idempotency_key required' });
   }
   ```

---

## 🧪 Testing Security

### Run Security Verification
```bash
node payment/tests/security-verification.js
```

### Manual Testing

**Test SQL Injection Prevention:**
```bash
curl -X POST http://localhost:3004/orders \
  -H "Content-Type: application/json" \
  -d '{"user_id": "1 OR 1=1", "items": [], "total_price": 100}'
# Should be rejected by validation
```

**Test Idempotency:**
```bash
# Send same request twice with same key
IDEMPOTENCY_KEY="550e8400-e29b-41d4-a716-446655440000"

curl -X POST http://localhost:3004/payments \
  -H "Content-Type: application/json" \
  -d "{\"order_id\": 1, \"payment_method\": \"card\", \"idempotency_key\": \"$IDEMPOTENCY_KEY\"}"

# Second request should return cached response
curl -X POST http://localhost:3004/payments \
  -H "Content-Type: application/json" \
  -d "{\"order_id\": 1, \"payment_method\": \"card\", \"idempotency_key\": \"$IDEMPOTENCY_KEY\"}"
```

**Test Log Masking:**
```javascript
// Check logs for masked data
logInfo('Test', {
  card: '4532123456789010',
  email: 'test@example.com',
  cvv: '123'
});
// Verify output shows: ****-****-****-9010, t***@example.com, [REDACTED]
```

---

## 📋 Security Checklist

Before deploying to production:

- [ ] All database queries use parameterized statements
- [ ] No sensitive data (card numbers, CVV) stored in database
- [ ] All payment operations wrapped in transactions
- [ ] All logs use masking functions
- [ ] Idempotency middleware applied to payment endpoints
- [ ] Environment variables configured (ENCRYPTION_KEY, ENCRYPTION_IV)
- [ ] HTTPS enabled for all endpoints
- [ ] Authentication middleware integrated
- [ ] CORS properly configured
- [ ] Security verification tests passing

---

## 🚨 Common Security Mistakes to Avoid

1. **❌ Storing raw card numbers**
   ```javascript
   // NEVER DO THIS
   await db.execute('INSERT INTO payments (card_number) VALUES (?)', [cardNumber]);
   ```

2. **❌ String concatenation in SQL**
   ```javascript
   // NEVER DO THIS
   await db.execute(`SELECT * FROM users WHERE id = ${userId}`);
   ```

3. **❌ Logging sensitive data without masking**
   ```javascript
   // NEVER DO THIS
   console.log('Payment:', { card: cardNumber, cvv: cvv });
   ```

4. **❌ Forgetting to release connections**
   ```javascript
   // NEVER DO THIS
   const connection = await db.getConnection();
   await connection.execute('...');
   // Missing: connection.release()
   ```

5. **❌ Not using idempotency keys**
   ```javascript
   // NEVER DO THIS
   router.post('/payments', async (req, res) => {
     // No idempotency check - can charge twice!
   });
   ```

---

## 📞 Support

For security concerns or questions:
- Review the [Security Report](./SECURITY_REPORT.md)
- Check the [Requirements Document](../.kiro/specs/payment-system-api/requirements.md)
- Run security verification: `node payment/tests/security-verification.js`

---

*Last updated: 2024-12-03*
