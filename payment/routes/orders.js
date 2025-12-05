/**
 * 주문 라우트
 * 주문 생성 엔드포인트
 * 요구사항: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6
 */

import express from 'express';
import { db } from '../../shared/db.js';
import { createOrder } from '../services/orderService.js';
import { validateOrderCreation } from '../middleware/validation.js';
import { logInfo, logError } from '../utils/logger.js';

const router = express.Router();

/**
 * POST /orders
 * 주문 생성 엔드포인트
 * 요구사항: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6
 */
router.post('/', validateOrderCreation, async (req, res) => {
  let connection;
  
  try {
    const { user_id, items, total_price } = req.body;

    // 트랜잭션 시작
    connection = await db.getConnection();
    await connection.beginTransaction();

    // 주문 생성 (트랜잭션 내에서 실행)
    const orderId = await createOrder(user_id, items, total_price, connection);

    // 트랜잭션 커밋
    await connection.commit();

    logInfo('Order created successfully via API', {
      order_id: orderId,
      user_id,
      items_count: items.length,
      total_price
    });

    // 성공 응답
    res.status(201).json({
      success: true,
      order_id: orderId,
      message: 'Order created successfully'
    });

  } catch (error) {
    // 트랜잭션 롤백
    if (connection) {
      try {
        await connection.rollback();
        logError('Order creation transaction rolled back', error, {
          user_id: req.body.user_id
        });
      } catch (rollbackError) {
        logError('Failed to rollback transaction', rollbackError);
      }
    }

    // 에러 응답
    logError('Failed to create order via API', error, {
      user_id: req.body.user_id,
      total_price: req.body.total_price
    });

    // 에러 타입에 따른 응답 코드 결정
    let statusCode = 500;
    let errorCode = 'DATABASE_ERROR';
    let errorMessage = 'Failed to create order';

    if (error.message.includes('Invalid')) {
      statusCode = 400;
      errorCode = 'VALIDATION_ERROR';
      errorMessage = error.message;
    } else if (error.message.includes('not found')) {
      statusCode = 404;
      errorCode = 'NOT_FOUND';
      errorMessage = error.message;
    }

    res.status(statusCode).json({
      success: false,
      message: errorMessage,
      error_code: errorCode
    });

  } finally {
    // Connection release 보장
    if (connection) {
      connection.release();
    }
  }
});

export default router;
