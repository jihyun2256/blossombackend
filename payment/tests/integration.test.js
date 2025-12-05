/**
 * Integration Tests
 * 통합 테스트 - 전체 플로우 검증
 * Requirements: 1.1-1.6, 2.1-2.6, 3.1-3.6, 4.1-4.6, 5.1-5.6, 6.1-6.6, 9.1-9.5
 */

import { v4 as uuidv4 } from 'uuid';

// 테스트 설정
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3004';
const TEST_USER_ID = 9999;

// 색상 코드
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

// 테스트 결과
const results = {
  passed: 0,
  failed: 0,
  total: 0
};

/**
 * 로그 헬퍼
 */
function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  log(`\n${'='.repeat(80)}`, 'cyan');
  log(`  ${title}`, 'cyan');
  log('='.repeat(80), 'cyan');
}

function logTest(name) {
  log(`\n테스트: ${name}`, 'blue');
  results.total++;
}

function logPass(message) {
  log(`  ✓ ${message}`, 'green');
  results.passed++;
}

function logFail(message, error) {
  log(`  ✗ ${message}`, 'red');
  if (error) {
    log(`    Error: ${error.message || error}`, 'red');
  }
  results.failed++;
}

/**
 * HTTP 요청 헬퍼
 */
async function makeRequest(method, path, body = null) {
  const url = `${API_BASE_URL}${path}`;
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json'
    }
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  const data = await response.json();
  
  return {
    status: response.status,
    data
  };
}

/**
 * 테스트 1: 주문 생성 → 결제 → 승인 전체 플로우
 * Requirements: 1.1-1.6, 2.1-2.6, 3.1-3.6
 */
async function testCompletePaymentFlow() {
  logSection('테스트 1: 주문 생성 → 결제 → 승인 전체 플로우');
  
  try {
    // Step 1: 주문 생성
    logTest('1.1 주문 생성');
    const orderData = {
      user_id: TEST_USER_ID,
      items: [
        { product_id: 1, quantity: 2, price: 10.99 },
        { product_id: 2, quantity: 1, price: 25.50 }
      ],
      total_price: 47.48
    };

    const orderResponse = await makeRequest('POST', '/orders', orderData);
    
    if (orderResponse.status === 201 && orderResponse.data.success) {
      logPass(`주문 생성 성공: order_id = ${orderResponse.data.order_id}`);
    } else {
      logFail('주문 생성 실패', orderResponse.data);
      return;
    }

    const orderId = orderResponse.data.order_id;

    // Step 2: 결제 요청
    logTest('1.2 결제 요청');
    const paymentData = {
      order_id: orderId,
      payment_method: 'card',
      idempotency_key: uuidv4()
    };

    const paymentResponse = await makeRequest('POST', '/payments', paymentData);
    
    if (paymentResponse.status === 201 && paymentResponse.data.success) {
      logPass(`결제 생성 성공: payment_id = ${paymentResponse.data.payment_id}`);
      logPass(`트랜잭션 ID: ${paymentResponse.data.transaction_id}`);
      logPass(`결제 상태: ${paymentResponse.data.status}`);
    } else {
      logFail('결제 생성 실패', paymentResponse.data);
      return;
    }

    const paymentId = paymentResponse.data.payment_id;

    // Step 3: 결제 조회
    logTest('1.3 결제 조회');
    const getPaymentResponse = await makeRequest('GET', `/payments/${paymentId}`);
    
    if (getPaymentResponse.status === 200 && getPaymentResponse.data.success) {
      logPass('결제 조회 성공');
      logPass(`결제 금액: ${getPaymentResponse.data.payment.amount}`);
      logPass(`결제 상태: ${getPaymentResponse.data.payment.status}`);
    } else {
      logFail('결제 조회 실패', getPaymentResponse.data);
    }

  } catch (error) {
    logFail('전체 플로우 테스트 실패', error);
  }
}

/**
 * 테스트 2: 결제 실패 시나리오
 * Requirements: 4.1-4.6
 */
async function testPaymentFailureScenario() {
  logSection('테스트 2: 결제 실패 시나리오');
  
  try {
    // Step 1: 주문 생성
    logTest('2.1 주문 생성');
    const orderData = {
      user_id: TEST_USER_ID,
      items: [
        { product_id: 1, quantity: 1, price: 99.99 }
      ],
      total_price: 99.99
    };

    const orderResponse = await makeRequest('POST', '/orders', orderData);
    
    if (orderResponse.status === 201 && orderResponse.data.success) {
      logPass(`주문 생성 성공: order_id = ${orderResponse.data.order_id}`);
    } else {
      logFail('주문 생성 실패', orderResponse.data);
      return;
    }

    const orderId = orderResponse.data.order_id;

    // Step 2: 잘못된 결제 수단으로 결제 시도
    logTest('2.2 잘못된 결제 수단으로 결제 시도');
    const invalidPaymentData = {
      order_id: orderId,
      payment_method: 'invalid_method',
      idempotency_key: uuidv4()
    };

    const paymentResponse = await makeRequest('POST', '/payments', invalidPaymentData);
    
    if (paymentResponse.status === 400 || paymentResponse.status === 422) {
      logPass('잘못된 결제 수단 거부됨');
      logPass(`에러 메시지: ${paymentResponse.data.message}`);
    } else {
      logFail('잘못된 결제 수단이 허용됨', paymentResponse.data);
    }

    // Step 3: 존재하지 않는 주문으로 결제 시도
    logTest('2.3 존재하지 않는 주문으로 결제 시도');
    const nonExistentOrderPayment = {
      order_id: 999999,
      payment_method: 'card',
      idempotency_key: uuidv4()
    };

    const nonExistentResponse = await makeRequest('POST', '/payments', nonExistentOrderPayment);
    
    if (nonExistentResponse.status === 404 || nonExistentResponse.status === 400) {
      logPass('존재하지 않는 주문 거부됨');
    } else {
      logFail('존재하지 않는 주문이 허용됨', nonExistentResponse.data);
    }

  } catch (error) {
    logFail('결제 실패 시나리오 테스트 실패', error);
  }
}

/**
 * 테스트 3: 결제 취소 시나리오
 * Requirements: 5.1-5.6
 */
async function testPaymentCancellationScenario() {
  logSection('테스트 3: 결제 취소 시나리오');
  
  try {
    // Step 1: 주문 생성
    logTest('3.1 주문 생성');
    const orderData = {
      user_id: TEST_USER_ID,
      items: [
        { product_id: 1, quantity: 1, price: 50.00 }
      ],
      total_price: 50.00
    };

    const orderResponse = await makeRequest('POST', '/orders', orderData);
    
    if (orderResponse.status === 201 && orderResponse.data.success) {
      logPass(`주문 생성 성공: order_id = ${orderResponse.data.order_id}`);
    } else {
      logFail('주문 생성 실패', orderResponse.data);
      return;
    }

    const orderId = orderResponse.data.order_id;

    // Step 2: 결제 생성
    logTest('3.2 결제 생성');
    const paymentData = {
      order_id: orderId,
      payment_method: 'card',
      idempotency_key: uuidv4()
    };

    const paymentResponse = await makeRequest('POST', '/payments', paymentData);
    
    if (paymentResponse.status === 201 && paymentResponse.data.success) {
      logPass(`결제 생성 성공: payment_id = ${paymentResponse.data.payment_id}`);
    } else {
      logFail('결제 생성 실패', paymentResponse.data);
      return;
    }

    const paymentId = paymentResponse.data.payment_id;

    // Step 3: 결제 취소
    logTest('3.3 결제 취소');
    const cancellationData = {
      reason: '고객 요청에 의한 취소'
    };

    const cancelResponse = await makeRequest('POST', `/payments/${paymentId}/cancel`, cancellationData);
    
    if (cancelResponse.status === 200 && cancelResponse.data.success) {
      logPass('결제 취소 성공');
      logPass(`취소 ID: ${cancelResponse.data.cancellation_id}`);
      logPass(`결제 상태: ${cancelResponse.data.status}`);
    } else {
      logFail('결제 취소 실패', cancelResponse.data);
      return;
    }

    // Step 4: 취소된 결제 조회
    logTest('3.4 취소된 결제 조회');
    const getPaymentResponse = await makeRequest('GET', `/payments/${paymentId}`);
    
    if (getPaymentResponse.status === 200 && getPaymentResponse.data.success) {
      logPass('취소된 결제 조회 성공');
      if (getPaymentResponse.data.payment.status === 'cancelled') {
        logPass('결제 상태가 cancelled로 업데이트됨');
      } else {
        logFail('결제 상태가 cancelled로 업데이트되지 않음', getPaymentResponse.data);
      }
    } else {
      logFail('취소된 결제 조회 실패', getPaymentResponse.data);
    }

  } catch (error) {
    logFail('결제 취소 시나리오 테스트 실패', error);
  }
}

/**
 * 테스트 4: SQL Injection 공격 시도
 * Requirements: 6.1-6.6
 */
async function testSQLInjectionPrevention() {
  logSection('테스트 4: SQL Injection 공격 시도');
  
  const sqlInjectionPayloads = [
    "1' OR '1'='1",
    "1; DROP TABLE orders--",
    "1' UNION SELECT * FROM users--",
    "admin'--",
    "' OR 1=1--"
  ];

  try {
    // Test 1: SQL Injection in user_id
    logTest('4.1 user_id에 SQL Injection 시도');
    const orderData = {
      user_id: sqlInjectionPayloads[0],
      items: [
        { product_id: 1, quantity: 1, price: 10.00 }
      ],
      total_price: 10.00
    };

    const orderResponse = await makeRequest('POST', '/orders', orderData);
    
    if (orderResponse.status === 400 || orderResponse.status === 422) {
      logPass('SQL Injection 공격 차단됨 (user_id)');
    } else {
      logFail('SQL Injection 공격이 차단되지 않음', orderResponse.data);
    }

    // Test 2: SQL Injection in payment_method
    logTest('4.2 payment_method에 SQL Injection 시도');
    
    // 먼저 정상 주문 생성
    const validOrderData = {
      user_id: TEST_USER_ID,
      items: [{ product_id: 1, quantity: 1, price: 10.00 }],
      total_price: 10.00
    };
    const validOrderResponse = await makeRequest('POST', '/orders', validOrderData);
    
    if (validOrderResponse.status === 201) {
      const orderId = validOrderResponse.data.order_id;
      
      const maliciousPaymentData = {
        order_id: orderId,
        payment_method: sqlInjectionPayloads[1],
        idempotency_key: uuidv4()
      };

      const paymentResponse = await makeRequest('POST', '/payments', maliciousPaymentData);
      
      if (paymentResponse.status === 400 || paymentResponse.status === 422) {
        logPass('SQL Injection 공격 차단됨 (payment_method)');
      } else {
        logFail('SQL Injection 공격이 차단되지 않음', paymentResponse.data);
      }
    }

    // Test 3: SQL Injection in product_id
    logTest('4.3 product_id에 SQL Injection 시도');
    const maliciousOrderData = {
      user_id: TEST_USER_ID,
      items: [
        { product_id: sqlInjectionPayloads[2], quantity: 1, price: 10.00 }
      ],
      total_price: 10.00
    };

    const maliciousOrderResponse = await makeRequest('POST', '/orders', maliciousOrderData);
    
    if (maliciousOrderResponse.status === 400 || maliciousOrderResponse.status === 422) {
      logPass('SQL Injection 공격 차단됨 (product_id)');
    } else {
      logFail('SQL Injection 공격이 차단되지 않음', maliciousOrderResponse.data);
    }

  } catch (error) {
    logFail('SQL Injection 방어 테스트 실패', error);
  }
}

/**
 * 테스트 5: 중복 결제 방지 (Idempotency)
 * Requirements: 9.1-9.5
 */
async function testIdempotencyProtection() {
  logSection('테스트 5: 중복 결제 방지 (Idempotency)');
  
  try {
    // Step 1: 주문 생성
    logTest('5.1 주문 생성');
    const orderData = {
      user_id: TEST_USER_ID,
      items: [
        { product_id: 1, quantity: 1, price: 30.00 }
      ],
      total_price: 30.00
    };

    const orderResponse = await makeRequest('POST', '/orders', orderData);
    
    if (orderResponse.status === 201 && orderResponse.data.success) {
      logPass(`주문 생성 성공: order_id = ${orderResponse.data.order_id}`);
    } else {
      logFail('주문 생성 실패', orderResponse.data);
      return;
    }

    const orderId = orderResponse.data.order_id;
    const idempotencyKey = uuidv4();

    // Step 2: 첫 번째 결제 요청
    logTest('5.2 첫 번째 결제 요청');
    const paymentData = {
      order_id: orderId,
      payment_method: 'card',
      idempotency_key: idempotencyKey
    };

    const firstPaymentResponse = await makeRequest('POST', '/payments', paymentData);
    
    if (firstPaymentResponse.status === 201 && firstPaymentResponse.data.success) {
      logPass(`첫 번째 결제 성공: payment_id = ${firstPaymentResponse.data.payment_id}`);
    } else {
      logFail('첫 번째 결제 실패', firstPaymentResponse.data);
      return;
    }

    const firstPaymentId = firstPaymentResponse.data.payment_id;

    // Step 3: 동일한 idempotency_key로 중복 요청
    logTest('5.3 동일한 idempotency_key로 중복 요청');
    const secondPaymentResponse = await makeRequest('POST', '/payments', paymentData);
    
    if (secondPaymentResponse.status === 200 || secondPaymentResponse.status === 201) {
      if (secondPaymentResponse.data.payment_id === firstPaymentId) {
        logPass('중복 요청이 감지되어 동일한 결제 결과 반환됨');
        logPass(`첫 번째 payment_id: ${firstPaymentId}`);
        logPass(`두 번째 payment_id: ${secondPaymentResponse.data.payment_id}`);
      } else {
        logFail('중복 결제가 생성됨 (Idempotency 실패)', {
          first: firstPaymentId,
          second: secondPaymentResponse.data.payment_id
        });
      }
    } else {
      logFail('중복 요청 처리 실패', secondPaymentResponse.data);
    }

    // Step 4: 다른 idempotency_key로 새 결제 요청
    logTest('5.4 다른 idempotency_key로 새 결제 요청');
    
    // 새 주문 생성
    const newOrderResponse = await makeRequest('POST', '/orders', orderData);
    if (newOrderResponse.status === 201) {
      const newOrderId = newOrderResponse.data.order_id;
      
      const newPaymentData = {
        order_id: newOrderId,
        payment_method: 'card',
        idempotency_key: uuidv4() // 새로운 키
      };

      const newPaymentResponse = await makeRequest('POST', '/payments', newPaymentData);
      
      if (newPaymentResponse.status === 201 && newPaymentResponse.data.success) {
        if (newPaymentResponse.data.payment_id !== firstPaymentId) {
          logPass('새로운 idempotency_key로 새 결제 생성됨');
          logPass(`새 payment_id: ${newPaymentResponse.data.payment_id}`);
        } else {
          logFail('새로운 키인데도 동일한 결제가 반환됨', newPaymentResponse.data);
        }
      } else {
        logFail('새 결제 생성 실패', newPaymentResponse.data);
      }
    }

  } catch (error) {
    logFail('Idempotency 테스트 실패', error);
  }
}

/**
 * 테스트 6: 입력 검증 테스트
 * Requirements: 6.1-6.6
 */
async function testInputValidation() {
  logSection('테스트 6: 입력 검증');
  
  try {
    // Test 1: 필수 필드 누락
    logTest('6.1 필수 필드 누락 (user_id)');
    const missingUserIdData = {
      items: [{ product_id: 1, quantity: 1, price: 10.00 }],
      total_price: 10.00
    };

    const missingUserIdResponse = await makeRequest('POST', '/orders', missingUserIdData);
    
    if (missingUserIdResponse.status === 400) {
      logPass('필수 필드 누락 감지됨 (user_id)');
    } else {
      logFail('필수 필드 누락이 감지되지 않음', missingUserIdResponse.data);
    }

    // Test 2: 잘못된 데이터 타입
    logTest('6.2 잘못된 데이터 타입 (user_id)');
    const invalidTypeData = {
      user_id: 'not_a_number',
      items: [{ product_id: 1, quantity: 1, price: 10.00 }],
      total_price: 10.00
    };

    const invalidTypeResponse = await makeRequest('POST', '/orders', invalidTypeData);
    
    if (invalidTypeResponse.status === 400 || invalidTypeResponse.status === 422) {
      logPass('잘못된 데이터 타입 감지됨');
    } else {
      logFail('잘못된 데이터 타입이 허용됨', invalidTypeResponse.data);
    }

    // Test 3: 음수 금액
    logTest('6.3 음수 금액');
    const negativeAmountData = {
      user_id: TEST_USER_ID,
      items: [{ product_id: 1, quantity: 1, price: -10.00 }],
      total_price: -10.00
    };

    const negativeAmountResponse = await makeRequest('POST', '/orders', negativeAmountData);
    
    if (negativeAmountResponse.status === 400 || negativeAmountResponse.status === 422) {
      logPass('음수 금액 거부됨');
    } else {
      logFail('음수 금액이 허용됨', negativeAmountResponse.data);
    }

    // Test 4: 빈 items 배열
    logTest('6.4 빈 items 배열');
    const emptyItemsData = {
      user_id: TEST_USER_ID,
      items: [],
      total_price: 0
    };

    const emptyItemsResponse = await makeRequest('POST', '/orders', emptyItemsData);
    
    if (emptyItemsResponse.status === 400 || emptyItemsResponse.status === 422) {
      logPass('빈 items 배열 거부됨');
    } else {
      logFail('빈 items 배열이 허용됨', emptyItemsResponse.data);
    }

  } catch (error) {
    logFail('입력 검증 테스트 실패', error);
  }
}

/**
 * 최종 요약
 */
function printSummary() {
  logSection('테스트 결과 요약');
  
  const passRate = results.total > 0 ? ((results.passed / results.total) * 100).toFixed(1) : 0;
  
  log(`\n총 테스트: ${results.total}`, 'blue');
  log(`통과: ${results.passed}`, 'green');
  log(`실패: ${results.failed}`, results.failed > 0 ? 'red' : 'green');
  log(`통과율: ${passRate}%`, passRate >= 80 ? 'green' : 'yellow');
  
  if (results.failed === 0) {
    log('\n✓ 모든 통합 테스트를 통과했습니다!', 'green');
    log('  - 주문 생성 → 결제 → 승인 플로우 정상 작동', 'green');
    log('  - 결제 실패 시나리오 정상 처리', 'green');
    log('  - 결제 취소 시나리오 정상 작동', 'green');
    log('  - SQL Injection 공격 차단', 'green');
    log('  - 중복 결제 방지 (Idempotency) 정상 작동', 'green');
    log('  - 입력 검증 정상 작동', 'green');
  } else {
    log('\n✗ 일부 테스트에 실패했습니다.', 'red');
    log('실패한 테스트들을 확인하고 수정해주세요.', 'yellow');
  }
  
  log('');
}

/**
 * 메인 실행
 */
async function main() {
  log('\n통합 테스트 시작...', 'blue');
  log('API Base URL: ' + API_BASE_URL, 'blue');
  log('Test User ID: ' + TEST_USER_ID, 'blue');
  
  await testCompletePaymentFlow();
  await testPaymentFailureScenario();
  await testPaymentCancellationScenario();
  await testSQLInjectionPrevention();
  await testIdempotencyProtection();
  await testInputValidation();
  
  printSummary();
  
  // 실패가 있으면 exit code 1 반환
  process.exit(results.failed > 0 ? 1 : 0);
}

// 실행
main().catch(error => {
  log('\n테스트 실행 중 오류 발생:', 'red');
  console.error(error);
  process.exit(1);
});
