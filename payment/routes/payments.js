/**
 * 결제 라우트
 * 결제 처리 엔드포인트
 * 요구사항: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6,
 *          4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
 */

import express from 'express';
import { createPayment, cancelPayment, getPaymentById } from '../services/paymentService.js';
import { getOrderById } from '../services/orderService.js';
import { validatePaymentRequest, validateCancellationRequest } from '../middleware/validation.js';
import { checkIdempotency, storeIdempotencyResponse } from '../middleware/idempotency.js';
import { logInfo, logError, maskSensitiveData } from '../utils/logger.js';
import { processCardPayment } from '../services/cardService.js';

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

    // 주문 존재 여부 확인
    const order = await getOrderById(order_id);
    
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

    // 결제 생성 및 처리
    const result = await createPayment(
      order_id,
      order.user_id,
      order.total_price,
      payment_method,
      idempotency_key,
      cardPaymentResult  // 카드 결제 결과 전달
    );

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
 * GET /payments/:id
 * 결제 조회 엔드포인트
 * 요구사항: 2.1, 3.1
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // 결제 조회
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
