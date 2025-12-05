/**
 * 결제 서비스
 * 결제 처리 로직
 * 요구사항: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6,
 *          4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6,
 *          8.1, 8.2, 8.3, 8.4, 8.5
 */

import { db } from '../../shared/db.js';
import { logInfo, logError, logPayment } from '../utils/logger.js';
import { generateRandomToken } from '../utils/encryption.js';
import { isValidUserId, isValidAmount, isValidPaymentMethod } from '../utils/validator.js';
import { updateOrderStatus, linkPaymentToOrder } from './orderService.js';

/**
 * 결제 생성 및 처리 (트랜잭션)
 * @param {number} orderId - 주문 ID
 * @param {number} userId - 사용자 ID
 * @param {number} amount - 결제 금액
 * @param {string} paymentMethod - 결제 수단
 * @param {string} idempotencyKey - Idempotency 키
 * @param {Object} cardPaymentResult - 카드 결제 결과 (선택사항)
 * @returns {Promise<Object>} - { paymentId, status, transactionId }
 */
async function createPayment(orderId, userId, amount, paymentMethod, idempotencyKey, cardPaymentResult = null) {
  let connection;
  
  try {
    console.log('🔍 Payment validation:', {
      orderId,
      userId,
      amount,
      paymentMethod,
      idempotencyKey: idempotencyKey ? 'present' : 'missing',
      cardPaymentResult: cardPaymentResult ? 'present' : 'null'
    });

    // 입력 검증
    if (!isValidUserId(orderId)) {
      throw new Error(`Invalid order_id: ${orderId}`);
    }

    if (!isValidUserId(userId)) {
      throw new Error(`Invalid user_id: ${userId}`);
    }

    if (!isValidAmount(amount)) {
      throw new Error(`Invalid amount: ${amount}`);
    }

    if (!isValidPaymentMethod(paymentMethod)) {
      throw new Error(`Invalid payment_method: ${paymentMethod}`);
    }

    if (!idempotencyKey || typeof idempotencyKey !== 'string') {
      throw new Error(`Invalid idempotency_key: ${idempotencyKey}`);
    }

    console.log('✅ All validations passed');

    // 트랜잭션 시작
    console.log('🔄 Getting database connection...');
    connection = await db.getConnection();
    console.log('✅ Database connection acquired');
    
    await connection.beginTransaction();
    console.log('✅ Transaction started');

    // 고유한 payment_id 생성
    const paymentId = `PAY_${Date.now()}_${generateRandomToken(8)}`;

    // 결제 레코드 생성 (파라미터화된 쿼리)
    // 민감정보(카드번호, CVV) 저장 금지 - 토큰만 저장
    await connection.execute(
      `INSERT INTO payments 
       (payment_id, order_id, user_id, amount, payment_method, status, idempotency_key) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [paymentId, orderId, userId, amount, paymentMethod, 'pending', idempotencyKey]
    );

    // 주문에 결제 정보 연결
    await linkPaymentToOrder(orderId, paymentId, paymentMethod, connection);

    logInfo('Payment created', {
      payment_id: paymentId,
      order_id: orderId,
      user_id: userId,
      amount,
      payment_method: paymentMethod
    });

    // 결제 게이트웨이 처리
    let gatewayResult;
    
    if (cardPaymentResult) {
      // 카드 결제 결과 사용 (이미 처리됨)
      gatewayResult = {
        success: true,
        transactionId: cardPaymentResult.transactionId,
        cardType: cardPaymentResult.cardType,
        lastFourDigits: cardPaymentResult.lastFourDigits
      };
      
      logInfo('Using card payment result', {
        payment_id: paymentId,
        card_type: cardPaymentResult.cardType,
        last_four: cardPaymentResult.lastFourDigits
      });
    } else {
      // 기존 게이트웨이 처리 (시뮬레이션)
      gatewayResult = await processPaymentGateway(paymentId, amount, paymentMethod);
    }

    if (gatewayResult.success) {
      // 결제 승인
      await approvePayment(paymentId, gatewayResult.transactionId, connection);
      await connection.commit();

      logPayment({
        payment_id: paymentId,
        order_id: orderId,
        status: 'completed',
        transaction_id: gatewayResult.transactionId
      });

      return {
        paymentId,
        status: 'completed',
        transactionId: gatewayResult.transactionId
      };
    } else {
      // 결제 실패
      await failPayment(paymentId, gatewayResult.errorMessage, connection);
      await connection.commit();

      logError('Payment failed at gateway', null, {
        payment_id: paymentId,
        error: gatewayResult.errorMessage
      });

      return {
        paymentId,
        status: 'failed',
        errorMessage: gatewayResult.errorMessage
      };
    }
  } catch (error) {
    console.error('❌ Payment creation error:', error);
    // 트랜잭션 롤백
    if (connection) {
      try {
        await connection.rollback();
        console.log('✅ Transaction rolled back');
      } catch (rollbackError) {
        console.error('❌ Rollback failed:', rollbackError);
      }
      logError('Payment transaction rolled back', error, {
        order_id: orderId,
        user_id: userId,
        error_message: error.message,
        error_stack: error.stack
      });
    }
    throw error;
  } finally {
    // Connection release 보장
    if (connection) {
      try {
        connection.release();
        console.log('✅ Database connection released');
      } catch (releaseError) {
        console.error('❌ Connection release failed:', releaseError);
      }
    }
  }
}

/**
 * 결제 승인 (트랜잭션 내에서 실행)
 * @param {string} paymentId - 결제 ID
 * @param {string} transactionId - 게이트웨이 트랜잭션 ID
 * @param {Object} connection - 데이터베이스 연결
 * @returns {Promise<void>}
 */
async function approvePayment(paymentId, transactionId, connection) {
  try {
    // 결제 상태 업데이트 (parameterized query)
    const [result] = await connection.execute(
      `UPDATE payments 
       SET status = ?, transaction_id = ?, updated_at = NOW() 
       WHERE payment_id = ?`,
      ['completed', transactionId, paymentId]
    );

    if (result.affectedRows === 0) {
      throw new Error('Payment not found');
    }

    // 주문 조회
    const [payments] = await connection.execute(
      'SELECT order_id FROM payments WHERE payment_id = ?',
      [paymentId]
    );

    if (payments.length === 0) {
      throw new Error('Payment not found');
    }

    const orderId = payments[0].order_id;

    // 주문 상태 업데이트
    await updateOrderStatus(orderId, 'paid', connection);

    logInfo('Payment approved', {
      payment_id: paymentId,
      transaction_id: transactionId,
      order_id: orderId
    });
  } catch (error) {
    logError('Failed to approve payment', error, {
      payment_id: paymentId
    });
    throw error;
  }
}

/**
 * 결제 실패 처리 (트랜잭션 내에서 실행)
 * @param {string} paymentId - 결제 ID
 * @param {string} errorMessage - 에러 메시지
 * @param {Object} connection - 데이터베이스 연결
 * @returns {Promise<void>}
 */
async function failPayment(paymentId, errorMessage, connection) {
  try {
    // 결제 상태 업데이트 (parameterized query)
    const [result] = await connection.execute(
      `UPDATE payments 
       SET status = ?, gateway_response = ?, updated_at = NOW() 
       WHERE payment_id = ?`,
      ['failed', errorMessage, paymentId]
    );

    if (result.affectedRows === 0) {
      throw new Error('Payment not found');
    }

    // 주문 조회
    const [payments] = await connection.execute(
      'SELECT order_id FROM payments WHERE payment_id = ?',
      [paymentId]
    );

    if (payments.length === 0) {
      throw new Error('Payment not found');
    }

    const orderId = payments[0].order_id;

    // 주문 상태 업데이트
    await updateOrderStatus(orderId, 'payment_failed', connection);

    logInfo('Payment marked as failed', {
      payment_id: paymentId,
      order_id: orderId
    });
  } catch (error) {
    logError('Failed to mark payment as failed', error, {
      payment_id: paymentId
    });
    throw error;
  }
}

/**
 * 결제 취소 및 환불 처리
 * @param {string} paymentId - 결제 ID
 * @param {string} reason - 취소 사유
 * @param {number} cancelledBy - 취소 요청자 ID
 * @returns {Promise<Object>} - { cancellationId, status }
 */
async function cancelPayment(paymentId, reason, cancelledBy) {
  let connection;
  
  try {
    // 입력 검증
    if (!paymentId || typeof paymentId !== 'string') {
      throw new Error('Invalid payment_id');
    }

    // 트랜잭션 시작
    connection = await db.getConnection();
    await connection.beginTransaction();

    // 결제 조회 및 상태 확인 (parameterized query)
    const [payments] = await connection.execute(
      'SELECT * FROM payments WHERE payment_id = ?',
      [paymentId]
    );

    if (payments.length === 0) {
      throw new Error('Payment not found');
    }

    const payment = payments[0];

    if (payment.status !== 'completed') {
      throw new Error('Only completed payments can be cancelled');
    }

    // 취소 ID 생성
    const cancellationId = `CAN_${Date.now()}_${generateRandomToken(8)}`;

    // 취소 레코드 생성 (parameterized query)
    await connection.execute(
      `INSERT INTO payment_cancellations 
       (cancellation_id, payment_id, reason, cancelled_by) 
       VALUES (?, ?, ?, ?)`,
      [cancellationId, paymentId, reason, cancelledBy]
    );

    // 결제 상태 업데이트 (parameterized query)
    await connection.execute(
      `UPDATE payments 
       SET status = ?, updated_at = NOW() 
       WHERE payment_id = ?`,
      ['cancelled', paymentId]
    );

    // 주문 상태 업데이트
    await updateOrderStatus(payment.order_id, 'cancelled', connection);

    await connection.commit();

    logPayment({
      payment_id: paymentId,
      cancellation_id: cancellationId,
      status: 'cancelled',
      reason
    });

    return {
      cancellationId,
      status: 'cancelled'
    };
  } catch (error) {
    // 트랜잭션 롤백
    if (connection) {
      await connection.rollback();
      logError('Payment cancellation rolled back', error, {
        payment_id: paymentId
      });
    }
    throw error;
  } finally {
    // Connection release 보장
    if (connection) {
      connection.release();
    }
  }
}

/**
 * 결제 조회
 * @param {string} paymentId - 결제 ID
 * @returns {Promise<Object>} - 결제 정보
 */
async function getPaymentById(paymentId) {
  try {
    // 입력 검증
    if (!paymentId || typeof paymentId !== 'string') {
      throw new Error('Invalid payment_id');
    }

    // 결제 조회 (parameterized query)
    const [payments] = await db.execute(
      'SELECT * FROM payments WHERE payment_id = ?',
      [paymentId]
    );

    if (payments.length === 0) {
      return null;
    }

    const payment = payments[0];

    // 취소 정보 조회 (있는 경우)
    const [cancellations] = await db.execute(
      'SELECT * FROM payment_cancellations WHERE payment_id = ?',
      [paymentId]
    );

    if (cancellations.length > 0) {
      payment.cancellation = cancellations[0];
    }

    logInfo('Payment retrieved', { payment_id: paymentId });

    return payment;
  } catch (error) {
    logError('Failed to get payment', error, { payment_id: paymentId });
    throw error;
  }
}

/**
 * 결제 게이트웨이 처리 시뮬레이션
 * 실제 환경에서는 외부 결제 게이트웨이 API를 호출합니다
 * @param {string} paymentId - 결제 ID
 * @param {number} amount - 결제 금액
 * @param {string} paymentMethod - 결제 수단
 * @returns {Promise<Object>} - { success, transactionId, errorMessage }
 */
async function processPaymentGateway(paymentId, amount, paymentMethod) {
  // 시뮬레이션: 90% 성공률
  const success = Math.random() > 0.1;

  if (success) {
    // 트랜잭션 ID 생성 (실제로는 게이트웨이에서 받음)
    const transactionId = `TXN_${Date.now()}_${generateRandomToken(12)}`;
    
    return {
      success: true,
      transactionId
    };
  } else {
    return {
      success: false,
      errorMessage: 'Payment declined by gateway'
    };
  }
}

export {
  createPayment,
  approvePayment,
  failPayment,
  cancelPayment,
  getPaymentById
};
