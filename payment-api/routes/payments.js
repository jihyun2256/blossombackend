/**
 * 결제 라우트
 * 결제 처리 엔드포인트
 * 요구사항: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6,
 *          4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
 */

import express from 'express';
import axios from 'axios';
import { createPayment, cancelPayment, getPaymentById } from '../services/paymentService.js';
import { validatePaymentRequest, validateCancellationRequest } from '../middleware/validation.js';
import { checkIdempotency, storeIdempotencyResponse } from '../middleware/idempotency.js';
import { logInfo, logError, maskSensitiveData } from '../utils/logger.js';
import { processCardPayment } from '../services/cardService.js';
import redis from '../config/redis.js';
import { db } from '../../shared/db.js';

// Order API URL
const ORDER_API_URL = process.env.ORDER_API_URL || 'http://order-service';

const router = express.Router();

/**
 * POST /payments
 * 결제 요청 및 승인 엔드포인트
 * 요구사항: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6
 */
router.post('/', validatePaymentRequest, checkIdempotency, async (req, res) => {
  try {
    const { order_id, payment_method, idempotency_key } = req.body;
    let cardData = req.body.card_data;  // let으로 선언하여 재할당 가능하게 함

    // 주문 존재 여부 확인 (Order API 호출)
    let order;
    try {
      const orderResponse = await axios.get(`${ORDER_API_URL}/orders/${order_id}`);
      order = orderResponse.data.order;
    } catch (error) {
      logError('Failed to fetch order from Order API', error, { order_id });
      return res.status(404).json({
        success: false,
        message: 'Order not found',
        error_code: 'ORDER_NOT_FOUND'
      });
    }
    
    if (!order) {
      logError('Order not found for payment', null, { order_id });
      return res.status(404).json({
        success: false,
        message: 'Order not found',
        error_code: 'ORDER_NOT_FOUND'
      });
    }

    // 주문 상태 확인
    if (order.status !== 'pending') {
      logError('Invalid order status for payment', null, {
        order_id,
        current_status: order.status
      });
      return res.status(422).json({
        success: false,
        message: `Order cannot be paid. Current status: ${order.status}`,
        error_code: 'INVALID_ORDER_STATUS'
      });
    }

    // 카드 결제 처리 (카드 정보가 있는 경우)
    let cardPaymentResult = null;
    if (cardData && (payment_method === 'credit_card' || payment_method === 'debit_card')) {
      // 🔒 카드 정보로 결제 처리 (메모리에서만 처리, DB 저장 안 함)
      cardPaymentResult = await processCardPayment(cardData, order.total_price, order_id);
      
      if (!cardPaymentResult.success) {
        logError('Card payment failed', null, {
          order_id,
          error: cardPaymentResult.error
        });
        
        return res.status(422).json({
          success: false,
          message: cardPaymentResult.error,
          error_code: 'CARD_PAYMENT_FAILED'
        });
      }
      
      // 🔒 카드 정보 즉시 제거 (메모리에서)
      req.body.card_data = null;
      cardData = null;
    }

    // 결제 생성 및 처리 (Redis 기반 분산 락 예시)
    const lockKey = `payment_lock:${order_id}`;
    let hasLock = false;
    try {
      // 간단한 분산 락 구현: NX + EX 사용 (동일 주문 중복 결제 방지)
      hasLock = await redis.set(lockKey, 'locked', { NX: true, EX: 30 });
      if (!hasLock) {
        return res.status(429).json({
          success: false,
          message: 'Payment is already being processed for this order',
          error_code: 'PAYMENT_IN_PROGRESS'
        });
      }
    } catch (redisErr) {
      console.error('Redis error on acquiring payment lock:', redisErr);
      // Redis 장애 시에도 결제는 계속 진행 (락 없이)
    }

    const result = await createPayment(
      order_id,
      order.user_id,
      order.total_price,
      payment_method,
      idempotency_key,
      cardPaymentResult  // 카드 결제 결과 전달
    );

    // 결제 성공 시 주문 상태 업데이트
    if (result.status === 'completed') {
      try {
        await axios.patch(`${ORDER_API_URL}/orders/${order_id}/status`, {
          status: 'paid'
        });
        logInfo('Order status updated to paid', { order_id });
      } catch (error) {
        logError('Failed to update order status', error, { order_id });
        // 결제는 성공했으므로 계속 진행
      }
    }

    // 응답 데이터 준비
    const responseData = {
      success: true,
      payment_id: result.paymentId,
      status: result.status,
      message: result.status === 'completed' 
        ? 'Payment processed successfully' 
        : 'Payment failed'
    };

    // 트랜잭션 ID 추가 (성공한 경우)
    if (result.transactionId) {
      responseData.transaction_id = result.transactionId;
    }

    // 에러 메시지 추가 (실패한 경우)
    if (result.errorMessage) {
      responseData.error_message = result.errorMessage;
    }

    // Idempotency 응답 저장
    const requestData = { order_id, payment_method };
    await storeIdempotencyResponse(idempotency_key, requestData, responseData);

    // 응답 전송
    const statusCode = result.status === 'completed' ? 200 : 422;
    res.status(statusCode).json(responseData);

    // Cache delete: 결제가 생성되었으므로 관련 결제 캐시 무효화
    try {
      if (result.paymentId) {
        // Cache delete: 단건 결제 캐시 (payments:{paymentId})
        await redis.del(`payments:${result.paymentId}`);
      }
      if (order && order.user_id) {
        // Cache delete: 사용자별 결제 목록 캐시 (payments:user:{userId})
        await redis.del(`payments:user:${order.user_id}`);
      }
    } catch (redisErr) {
      console.error('Redis error on payments cache delete after create:', redisErr);
    }

    // 임시 결제 상태 Redis에 저장 (예시)
    try {
      const tempKey = `payment_status:${result.paymentId}`;
      await redis.set(tempKey, JSON.stringify({
        status: result.status,
        order_id,
        user_id: order.user_id
      }), { EX: 60 * 10 }); // 10분 TTL
    } catch (redisErr) {
      console.error('Redis error on storing temporary payment status:', redisErr);
    }

    // 락 해제
    try {
      if (hasLock) {
        await redis.del(lockKey);
      }
    } catch (redisErr) {
      console.error('Redis error on releasing payment lock:', redisErr);
    }

  } catch (error) {
    // 에러 처리 및 민감정보 마스킹
    console.error('❌ Payment API Error:', error);
    logError('Failed to process payment via API', error, {
      order_id: req.body.order_id,
      payment_method: req.body.payment_method,
      error_message: error.message,
      error_stack: error.stack
    });

    // 에러 타입에 따른 응답 코드 결정
    let statusCode = 500;
    let errorCode = 'PAYMENT_FAILED';
    let errorMessage = error.message || 'Failed to process payment';

    if (error.message && error.message.includes('Invalid')) {
      statusCode = 400;
      errorCode = 'VALIDATION_ERROR';
    } else if (error.message && error.message.includes('not found')) {
      statusCode = 404;
      errorCode = 'NOT_FOUND';
    } else if (error.message && error.message.includes('transaction')) {
      errorCode = 'TRANSACTION_ERROR';
      errorMessage = 'Transaction failed';
    }

    res.status(statusCode).json({
      success: false,
      message: errorMessage,
      error_code: errorCode,
      details: process.env.NODE_ENV !== 'production' ? error.message : undefined
    });
  }
});

/**
 * GET /payments/user/:userId
 * 특정 사용자의 결제 목록 조회 (캐싱 적용)
 * key: payments:user:{userId}, TTL = 60초
 */
router.get('/user/:userId', async (req, res) => {
  const { userId } = req.params;
  const cacheKey = `payments:user:${userId}`;

  // Cache get: 사용자별 결제 목록 캐시 확인
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      // Cache hit: Redis에 저장된 결제 목록 반환
      const payments = JSON.parse(cached);
      return res.status(200).json({
        success: true,
        payments
      });
    }
  } catch (redisErr) {
    console.error('Redis error on payments:user cache get:', redisErr);
  }

  try {
    // Cache miss: DB에서 사용자별 결제 목록 조회
    const [rows] = await db.execute(
      'SELECT * FROM payments WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );

    // Cache set: 조회 결과를 Redis에 캐싱 (TTL = 60초)
    try {
      await redis.set(cacheKey, JSON.stringify(rows || []), { EX: 60 });
    } catch (redisErr) {
      console.error('Redis error on payments:user cache set:', redisErr);
    }

    return res.status(200).json({
      success: true,
      payments: rows || []
    });
  } catch (error) {
    logError('Failed to retrieve payments by user via API', error, {
      user_id: userId
    });

    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve payments',
      error_code: 'DATABASE_ERROR'
    });
  }
});

/**
 * GET /payments/:id
 * 결제 조회 엔드포인트
 * 요구사항: 2.1, 3.1
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const cacheKey = `payments:${id}`;

    // Cache get: 단건 결제 캐시 확인
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        // Cache hit: Redis에 저장된 결제 정보 반환
        const cachedPayment = JSON.parse(cached);
        return res.status(200).json({
          success: true,
          payment: cachedPayment
        });
      }
    } catch (redisErr) {
      console.error('Redis error on payments:{id} cache get:', redisErr);
    }

    // Cache miss: 서비스 레이어에서 결제 조회
    const payment = await getPaymentById(id);

    if (!payment) {
      logError('Payment not found', null, { payment_id: id });
      return res.status(404).json({
        success: false,
        message: 'Payment not found',
        error_code: 'PAYMENT_NOT_FOUND'
      });
    }

    // 민감정보 마스킹
    const maskedPayment = maskSensitiveData(payment);

    // Cache set: 마스킹된 결제 정보를 Redis에 캐싱 (TTL = 180초)
    try {
      await redis.set(cacheKey, JSON.stringify(maskedPayment), { EX: 180 });
    } catch (redisErr) {
      console.error('Redis error on payments:{id} cache set:', redisErr);
    }

    logInfo('Payment retrieved via API', { payment_id: id });

    res.status(200).json({
      success: true,
      payment: maskedPayment
    });

  } catch (error) {
    logError('Failed to retrieve payment via API', error, {
      payment_id: req.params.id
    });

    res.status(500).json({
      success: false,
      message: 'Failed to retrieve payment',
      error_code: 'DATABASE_ERROR'
    });
  }
});

/**
 * POST /payments/:id/cancel
 * 결제 취소 엔드포인트
 * 요구사항: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
 */
router.post('/:id/cancel', validateCancellationRequest, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    // 취소 요청자 ID (인증 미들웨어에서 설정됨, 없으면 기본값)
    const cancelledBy = req.user?.id || null;

    // 결제 취소 처리
    const result = await cancelPayment(id, reason, cancelledBy);

    // Cache delete: 결제 상태가 변경되었으므로 관련 캐시 무효화
    try {
      // 취소된 결제 정보 조회 (사용자 ID 확인용)
      let paymentUserId = null;
      try {
        const payment = await getPaymentById(id);
        if (payment && payment.user_id) {
          paymentUserId = payment.user_id;
        }
      } catch (innerErr) {
        console.error('Error fetching payment after cancellation for cache delete:', innerErr);
      }

      // Cache delete: 단건 결제 캐시
      await redis.del(`payments:${id}`);

      // Cache delete: 사용자별 결제 목록 캐시
      if (paymentUserId) {
        await redis.del(`payments:user:${paymentUserId}`);
      }
    } catch (redisErr) {
      console.error('Redis error on payments cache delete after cancel:', redisErr);
    }

    logInfo('Payment cancelled via API', {
      payment_id: id,
      cancellation_id: result.cancellationId,
      cancelled_by: cancelledBy
    });

    res.status(200).json({
      success: true,
      cancellation_id: result.cancellationId,
      status: result.status,
      message: 'Payment cancelled successfully'
    });

  } catch (error) {
    // 에러 처리 및 민감정보 마스킹
    logError('Failed to cancel payment via API', error, {
      payment_id: req.params.id
    });

    // 에러 타입에 따른 응답 코드 결정
    let statusCode = 500;
    let errorCode = 'CANCELLATION_FAILED';
    let errorMessage = 'Failed to cancel payment';

    if (error.message.includes('Invalid')) {
      statusCode = 400;
      errorCode = 'VALIDATION_ERROR';
      errorMessage = error.message;
    } else if (error.message.includes('not found')) {
      statusCode = 404;
      errorCode = 'PAYMENT_NOT_FOUND';
      errorMessage = 'Payment not found';
    } else if (error.message.includes('Only completed')) {
      statusCode = 422;
      errorCode = 'INVALID_PAYMENT_STATUS';
      errorMessage = error.message;
    } else if (error.message.includes('transaction')) {
      errorCode = 'TRANSACTION_ERROR';
      errorMessage = 'Transaction failed';
    }

    res.status(statusCode).json({
      success: false,
      message: errorMessage,
      error_code: errorCode
    });
  }
});

export default router;
