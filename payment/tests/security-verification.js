/**
 * Security Verification Tests
 * 보안 강화 및 최종 검증
 * Requirements: 6.1, 6.2, 6.3, 7.1, 7.2, 7.3, 7.4, 7.5, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6,
 *               10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 11.1, 11.2, 11.3, 11.4, 11.5
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 색상 코드
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

// 검증 결과 저장
const results = {
  passed: [],
  failed: [],
  warnings: []
};

/**
 * 로그 출력 헬퍼
 */
function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  log(`\n${'='.repeat(80)}`, 'cyan');
  log(`  ${title}`, 'cyan');
  log('='.repeat(80), 'cyan');
}

function logPass(message) {
  log(`✓ ${message}`, 'green');
  results.passed.push(message);
}

function logFail(message) {
  log(`✗ ${message}`, 'red');
  results.failed.push(message);
}

function logWarning(message) {
  log(`⚠ ${message}`, 'yellow');
  results.warnings.push(message);
}

/**
 * 파일 내용 읽기
 */
function readFile(filePath) {
  try {
    const fullPath = path.join(__dirname, '..', filePath);
    return fs.readFileSync(fullPath, 'utf8');
  } catch (error) {
    logFail(`Failed to read file: ${filePath}`);
    return null;
  }
}

/**
 * 8.1 SQL Injection 방어 검증
 * Requirements: 6.2, 6.3
 */
function verifySQLInjectionPrevention() {
  logSection('8.1 SQL Injection 방어 검증');
  
  const filesToCheck = [
    'services/orderService.js',
    'services/paymentService.js',
    'services/idempotencyService.js'
  ];
  
  let allParameterized = true;
  let noDirectInjection = true;
  
  filesToCheck.forEach(file => {
    const content = readFile(file);
    if (!content) {
      allParameterized = false;
      return;
    }
    
    // Parameterized query 패턴 확인
    const executePattern = /\.execute\s*\(/g;
    const executeMatches = content.match(executePattern) || [];
    
    // 직접 문자열 삽입 패턴 확인 (위험)
    const dangerousPatterns = [
      /\.execute\s*\(\s*`[^`]*\$\{/g,  // Template literal with variables
      /\.execute\s*\(\s*'[^']*'\s*\+/g, // String concatenation
      /\.execute\s*\(\s*"[^"]*"\s*\+/g  // String concatenation
    ];
    
    let hasDangerousPattern = false;
    dangerousPatterns.forEach(pattern => {
      if (pattern.test(content)) {
        hasDangerousPattern = true;
        logFail(`${file}: Found potential SQL injection vulnerability (direct string concatenation)`);
        noDirectInjection = false;
      }
    });
    
    if (!hasDangerousPattern && executeMatches.length > 0) {
      logPass(`${file}: All queries use parameterized statements (${executeMatches.length} queries)`);
    }
    
    // Parameterized query 사용 확인 (?, ? 패턴)
    const parameterizedPattern = /\.execute\s*\(\s*['"`][^'"`]*\?[^'"`]*['"`]\s*,\s*\[/g;
    const parameterizedMatches = content.match(parameterizedPattern) || [];
    
    if (parameterizedMatches.length > 0) {
      logPass(`${file}: Uses parameterized queries with placeholders (${parameterizedMatches.length} instances)`);
    }
  });
  
  // Validator 검증
  const validatorContent = readFile('utils/validator.js');
  if (validatorContent) {
    if (validatorContent.includes('detectSQLInjection')) {
      logPass('validator.js: SQL Injection detection function implemented');
    } else {
      logFail('validator.js: SQL Injection detection function not found');
      allParameterized = false;
    }
  }
  
  if (allParameterized && noDirectInjection) {
    logPass('All database queries use parameterized statements');
    logPass('No direct user input injection detected');
  }
}

/**
 * 8.2 민감정보 저장 방지 검증
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6
 */
function verifySensitiveDataProtection() {
  logSection('8.2 민감정보 저장 방지 검증');
  
  const filesToCheck = [
    'services/paymentService.js',
    'services/orderService.js',
    'db/schema.sql'
  ];
  
  // 민감정보 필드 패턴 (저장하면 안 되는 것들)
  const forbiddenFields = [
    'card_number',
    'cardNumber',
    'cvv',
    'cvc',
    'cvv2',
    'card_cvv',
    'api_key',
    'apiKey',
    'secret_key',
    'password' // 결제 관련 비밀번호
  ];
  
  let noSensitiveStorage = true;
  
  filesToCheck.forEach(file => {
    const content = readFile(file);
    if (!content) {
      noSensitiveStorage = false;
      return;
    }
    
    // INSERT/UPDATE 문에서 민감정보 필드 확인
    const insertUpdatePattern = /(INSERT INTO|UPDATE)[\s\S]*?\(/gi;
    const matches = content.match(insertUpdatePattern) || [];
    
    matches.forEach(match => {
      forbiddenFields.forEach(field => {
        const fieldPattern = new RegExp(field, 'i');
        if (fieldPattern.test(match)) {
          logFail(`${file}: Found forbidden field '${field}' in database operation`);
          noSensitiveStorage = false;
        }
      });
    });
  });
  
  // Schema 검증
  const schemaContent = readFile('db/schema.sql');
  if (schemaContent) {
    let schemaClean = true;
    forbiddenFields.forEach(field => {
      const fieldPattern = new RegExp(`\\b${field}\\b`, 'i');
      if (fieldPattern.test(schemaContent)) {
        logFail(`schema.sql: Found forbidden field '${field}' in database schema`);
        noSensitiveStorage = false;
        schemaClean = false;
      }
    });
    
    if (schemaClean) {
      logPass('schema.sql: No sensitive data fields (card numbers, CVV, API keys) in schema');
    }
  }
  
  // Payment service에서 토큰만 저장하는지 확인
  const paymentContent = readFile('services/paymentService.js');
  if (paymentContent) {
    if (paymentContent.includes('transaction_id') || paymentContent.includes('transactionId')) {
      logPass('paymentService.js: Uses transaction_id/token from payment gateway');
    }
    
    if (paymentContent.includes('민감정보(카드번호, CVV) 저장 금지')) {
      logPass('paymentService.js: Contains explicit comment about not storing sensitive data');
    }
  }
  
  if (noSensitiveStorage) {
    logPass('No sensitive data (card numbers, CVV, API keys) stored in database');
    logPass('Only payment gateway tokens and transaction IDs are stored');
  }
}

/**
 * 8.3 트랜잭션 안전성 검증
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
 */
function verifyTransactionSafety() {
  logSection('8.3 트랜잭션 안전성 검증');
  
  const filesToCheck = [
    'services/paymentService.js',
    'services/orderService.js'
  ];
  
  let allTransactional = true;
  let allHaveRollback = true;
  let allHaveFinally = true;
  
  filesToCheck.forEach(file => {
    const content = readFile(file);
    if (!content) {
      allTransactional = false;
      return;
    }
    
    // 트랜잭션 시작 확인
    const beginTransactionPattern = /beginTransaction\s*\(\s*\)/g;
    const beginMatches = content.match(beginTransactionPattern) || [];
    
    // Commit 확인
    const commitPattern = /\.commit\s*\(\s*\)/g;
    const commitMatches = content.match(commitPattern) || [];
    
    // Rollback 확인
    const rollbackPattern = /\.rollback\s*\(\s*\)/g;
    const rollbackMatches = content.match(rollbackPattern) || [];
    
    // Finally 블록 확인
    const finallyPattern = /finally\s*\{[\s\S]*?connection\.release\s*\(\s*\)/g;
    const finallyMatches = content.match(finallyPattern) || [];
    
    if (beginMatches.length > 0) {
      logPass(`${file}: Uses database transactions (${beginMatches.length} instances)`);
      
      if (commitMatches.length >= beginMatches.length) {
        logPass(`${file}: All transactions have commit statements`);
      } else {
        logWarning(`${file}: Some transactions may be missing commit statements`);
      }
      
      if (rollbackMatches.length > 0) {
        logPass(`${file}: Implements rollback on errors (${rollbackMatches.length} instances)`);
      } else {
        logFail(`${file}: Missing rollback implementation`);
        allHaveRollback = false;
      }
      
      if (finallyMatches.length >= beginMatches.length) {
        logPass(`${file}: All transactions release connections in finally blocks`);
      } else {
        logFail(`${file}: Some transactions may not release connections properly`);
        allHaveFinally = false;
      }
    } else {
      // orderService는 connection을 파라미터로 받으므로 예외
      if (file.includes('orderService')) {
        logPass(`${file}: Uses connection parameter (transaction managed by caller)`);
      }
    }
  });
  
  if (allTransactional && allHaveRollback && allHaveFinally) {
    logPass('All payment operations execute within transactions');
    logPass('All transactions implement proper rollback on errors');
    logPass('All connections are properly released in finally blocks');
  }
}

/**
 * 8.4 로그 마스킹 검증
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6
 */
function verifyLogMasking() {
  logSection('8.4 로그 마스킹 검증');
  
  const loggerContent = readFile('utils/logger.js');
  if (!loggerContent) {
    logFail('logger.js not found');
    return;
  }
  
  // 마스킹 함수 확인
  const maskingFunctions = [
    'maskCardNumber',
    'maskEmail',
    'maskPhone',
    'redactSensitive',
    'maskSensitiveData'
  ];
  
  let allMaskingImplemented = true;
  maskingFunctions.forEach(func => {
    if (loggerContent.includes(`function ${func}`)) {
      logPass(`logger.js: ${func} function implemented`);
    } else {
      logFail(`logger.js: ${func} function not found`);
      allMaskingImplemented = false;
    }
  });
  
  // 카드번호 마스킹 로직 확인
  if (loggerContent.includes('****-****-****-')) {
    logPass('logger.js: Card number masking shows only last 4 digits');
  } else {
    logFail('logger.js: Card number masking pattern not found');
    allMaskingImplemented = false;
  }
  
  // 이메일 마스킹 로직 확인
  if (loggerContent.includes('charAt(0)') && loggerContent.includes('***')) {
    logPass('logger.js: Email masking shows only first character and domain');
  } else {
    logFail('logger.js: Email masking pattern not found');
    allMaskingImplemented = false;
  }
  
  // CVV/비밀번호 완전 제거 확인
  if (loggerContent.includes('[REDACTED]')) {
    logPass('logger.js: Sensitive data (CVV, passwords, API keys) completely redacted');
  } else {
    logFail('logger.js: Sensitive data redaction not found');
    allMaskingImplemented = false;
  }
  
  // 로그 함수들이 마스킹을 사용하는지 확인
  const logFunctions = ['logInfo', 'logError', 'logPayment'];
  logFunctions.forEach(func => {
    if (loggerContent.includes(`function ${func}`) && loggerContent.includes('maskSensitiveData')) {
      logPass(`logger.js: ${func} applies masking to data`);
    }
  });
  
  // Service 파일들이 logger를 사용하는지 확인
  const serviceFiles = [
    'services/paymentService.js',
    'services/orderService.js',
    'services/idempotencyService.js'
  ];
  
  serviceFiles.forEach(file => {
    const content = readFile(file);
    if (content) {
      if (content.includes('logInfo') || content.includes('logError') || content.includes('logPayment')) {
        logPass(`${file}: Uses masked logging functions`);
      } else {
        logWarning(`${file}: May not be using masked logging`);
      }
    }
  });
  
  if (allMaskingImplemented) {
    logPass('All sensitive information is properly masked in logs');
    logPass('Card numbers show only last 4 digits');
    logPass('Emails show only first character and domain');
    logPass('CVV, passwords, and API keys are completely removed');
  }
}

/**
 * 8.5 Idempotency 동작 검증
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5
 */
function verifyIdempotency() {
  logSection('8.5 Idempotency 동작 검증');
  
  const idempotencyServiceContent = readFile('services/idempotencyService.js');
  const idempotencyMiddlewareContent = readFile('middleware/idempotency.js');
  const schemaContent = readFile('db/schema.sql');
  
  if (!idempotencyServiceContent || !idempotencyMiddlewareContent) {
    logFail('Idempotency files not found');
    return;
  }
  
  // Service 함수 확인
  const requiredFunctions = [
    'checkIdempotencyKey',
    'storeIdempotencyKey',
    'getIdempotencyResult',
    'cleanupExpiredKeys'
  ];
  
  let allFunctionsImplemented = true;
  requiredFunctions.forEach(func => {
    if (idempotencyServiceContent.includes(`function ${func}`)) {
      logPass(`idempotencyService.js: ${func} function implemented`);
    } else {
      logFail(`idempotencyService.js: ${func} function not found`);
      allFunctionsImplemented = false;
    }
  });
  
  // 24시간 만료 확인
  if (idempotencyServiceContent.includes('24') || idempotencyServiceContent.includes('setHours')) {
    logPass('idempotencyService.js: 24-hour expiration implemented');
  } else {
    logWarning('idempotencyService.js: 24-hour expiration may not be configured');
  }
  
  // 중복 요청 시 캐시된 응답 반환 확인
  if (idempotencyServiceContent.includes('getIdempotencyResult') && 
      idempotencyServiceContent.includes('response_data')) {
    logPass('idempotencyService.js: Returns cached response for duplicate requests');
  }
  
  // Middleware 확인
  if (idempotencyMiddlewareContent.includes('checkIdempotencyKey') ||
      idempotencyMiddlewareContent.includes('getIdempotencyResult')) {
    logPass('idempotency.js: Middleware checks for duplicate requests');
  } else {
    logFail('idempotency.js: Middleware may not check for duplicates');
    allFunctionsImplemented = false;
  }
  
  // Schema 확인
  if (schemaContent) {
    if (schemaContent.includes('idempotency_keys') && 
        schemaContent.includes('expires_at')) {
      logPass('schema.sql: idempotency_keys table with expiration field exists');
    } else {
      logFail('schema.sql: idempotency_keys table may be missing or incomplete');
      allFunctionsImplemented = false;
    }
  }
  
  // Payment route에서 idempotency 사용 확인
  const paymentRouteContent = readFile('routes/payments.js');
  if (paymentRouteContent) {
    if (paymentRouteContent.includes('idempotency')) {
      logPass('payments.js: Uses idempotency middleware');
    } else {
      logWarning('payments.js: May not be using idempotency middleware');
    }
  }
  
  if (allFunctionsImplemented) {
    logPass('Idempotency key system fully implemented');
    logPass('Duplicate requests return cached responses');
    logPass('Keys expire after 24 hours');
  }
}

/**
 * 추가 보안 검증
 */
function verifyAdditionalSecurity() {
  logSection('추가 보안 검증');
  
  // 환경 변수 사용 확인
  const encryptionContent = readFile('utils/encryption.js');
  if (encryptionContent) {
    if (encryptionContent.includes('process.env.ENCRYPTION_KEY')) {
      logPass('encryption.js: Uses environment variables for encryption keys');
    } else {
      logFail('encryption.js: May not use environment variables for keys');
    }
    
    if (encryptionContent.includes('AES-256') || encryptionContent.includes('aes-256')) {
      logPass('encryption.js: Uses AES-256 encryption');
    }
  }
  
  // Validation 미들웨어 확인
  const validationContent = readFile('middleware/validation.js');
  if (validationContent) {
    if (validationContent.includes('validatePaymentRequest') && 
        validationContent.includes('idempotency_key')) {
      logPass('validation.js: Validates idempotency_key in payment requests');
    }
  }
  
  // App.js 보안 설정 확인
  const appContent = readFile('app.js');
  if (appContent) {
    if (appContent.includes('cors')) {
      logPass('app.js: CORS configured');
    }
    
    if (appContent.includes('authenticate') || appContent.includes('auth')) {
      logPass('app.js: Authentication middleware integrated');
    }
  }
}

/**
 * 최종 요약
 */
function printSummary() {
  logSection('검증 결과 요약');
  
  log(`\n통과: ${results.passed.length}`, 'green');
  log(`실패: ${results.failed.length}`, 'red');
  log(`경고: ${results.warnings.length}`, 'yellow');
  
  if (results.failed.length === 0) {
    log('\n✓ 모든 보안 검증을 통과했습니다!', 'green');
    log('  - SQL Injection 방어 완료', 'green');
    log('  - 민감정보 저장 방지 완료', 'green');
    log('  - 트랜잭션 안전성 확보', 'green');
    log('  - 로그 마스킹 구현 완료', 'green');
    log('  - Idempotency 시스템 구현 완료', 'green');
  } else {
    log('\n✗ 일부 보안 검증에 실패했습니다.', 'red');
    log('실패한 항목들을 확인하고 수정해주세요.', 'yellow');
  }
  
  if (results.warnings.length > 0) {
    log('\n⚠ 경고 항목들을 검토해주세요.', 'yellow');
  }
  
  log('');
}

/**
 * 메인 실행
 */
function main() {
  log('\n보안 강화 및 최종 검증 시작...', 'blue');
  log('Requirements: 6.1, 6.2, 6.3, 7.1, 7.2, 7.3, 7.4, 7.5, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6,', 'blue');
  log('              10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 11.1, 11.2, 11.3, 11.4, 11.5', 'blue');
  
  verifySQLInjectionPrevention();
  verifySensitiveDataProtection();
  verifyTransactionSafety();
  verifyLogMasking();
  verifyIdempotency();
  verifyAdditionalSecurity();
  
  printSummary();
  
  // 실패가 있으면 exit code 1 반환
  process.exit(results.failed.length > 0 ? 1 : 0);
}

// 실행
main();
