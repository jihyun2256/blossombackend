/**
 * 주문 서비스
 * 주문 생성 및 관리 로직
 * 요구사항: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6
 */

import { db } from '../../shared/db.js';
import { logInfo, logError } from '../utils/logger.js';
import { isValidUserId, isValidAmount, isValidOrderItems } from '../utils/validator.js';

/**
 * 주문 항목 검증
 * @param {Array} items - 주문 항목 배열
 * @returns {Object} - { valid: boolean, error: string }
 */
function validateOrderItems(items) {
  // 배열 검증
  if (!Array.isArray(items) || items.length === 0) {
    return { valid: false, error: 'Items must be a non-empty array' };
  }

  // 각 항목 검증
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    
    if (!item || typeof item !== 'object') {
      return { valid: false, error: `Item at index ${i} is invalid` };
    }

    if (!isValidUserId(item.product_id)) {
      return { valid: false, error: `Invalid product_id at index ${i}` };
    }

    const quantity = Number(item.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return { valid: false, error: `Invalid quantity at index ${i}` };
    }

    if (!isValidAmount(item.price)) {
      return { valid: false, error: `Invalid price at index ${i}` };
    }
  }

  return { valid: true };
}

/**
 * 주문 생성 (트랜잭션 내에서 실행)
 * @param {number} userId - 사용자 ID
 * @param {Array} items - 주문 항목 배열
 * @param {number} totalPrice - 총 금액
 * @param {Object} connection - 데이터베이스 연결 (트랜잭션용)
 * @returns {Promise<number>} - 생성된 주문 ID
 */
async function createOrder(userId, items, totalPrice, connection) {
  try {
    // 입력 검증
    if (!isValidUserId(userId)) {
      throw new Error('Invalid user_id');
    }

    if (!isValidAmount(totalPrice)) {
      throw new Error('Invalid total_price');
    }

    const validation = validateOrderItems(items);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // 주문 생성 (파라미터화된 쿼리)
    const [orderResult] = await connection.execute(
      'INSERT INTO orders (user_id, total_price, status) VALUES (?, ?, ?)',
      [userId, totalPrice, 'pending']
    );

    const orderId = orderResult.insertId;

    // 주문 항목 생성 (파라미터화된 쿼리)
    for (const item of items) {
      await connection.execute(
        'INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)',
        [orderId, item.product_id, item.quantity, item.price]
      );
    }

    logInfo('Order created successfully', {
      order_id: orderId,
      user_id: userId,
      items_count: items.length,
      total_price: totalPrice
    });

    return orderId;
  } catch (error) {
    logError('Failed to create order', error, {
      user_id: userId,
      total_price: totalPrice
    });
    throw error;
  }
}

/**
 * 주문 상태 업데이트 (파라미터화된 쿼리)
 * @param {number} orderId - 주문 ID
 * @param {string} status - 새로운 상태
 * @param {Object} connection - 데이터베이스 연결 (트랜잭션용)
 * @returns {Promise<void>}
 */
async function updateOrderStatus(orderId, status, connection) {
  try {
    // 입력 검증
    if (!isValidUserId(orderId)) {
      throw new Error('Invalid order_id');
    }

    const validStatuses = ['pending', 'paid', 'payment_failed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      throw new Error('Invalid status');
    }

    // 상태 업데이트 (파라미터화된 쿼리)
    const [result] = await connection.execute(
      'UPDATE orders SET status = ?, updated_at = NOW() WHERE id = ?',
      [status, orderId]
    );

    if (result.affectedRows === 0) {
      throw new Error('Order not found');
    }

    logInfo('Order status updated', {
      order_id: orderId,
      new_status: status
    });
  } catch (error) {
    logError('Failed to update order status', error, {
      order_id: orderId,
      status
    });
    throw error;
  }
}

/**
 * 주문 조회
 * @param {number} orderId - 주문 ID
 * @returns {Promise<Object>} - 주문 정보
 */
async function getOrderById(orderId) {
  try {
    // 입력 검증
    if (!isValidUserId(orderId)) {
      throw new Error('Invalid order_id');
    }

    // 주문 조회 (파라미터화된 쿼리)
    const [orders] = await db.execute(
      'SELECT * FROM orders WHERE id = ?',
      [orderId]
    );

    if (orders.length === 0) {
      return null;
    }

    const order = orders[0];

    // 주문 항목 조회 (파라미터화된 쿼리)
    const [items] = await db.execute(
      'SELECT * FROM order_items WHERE order_id = ?',
      [orderId]
    );

    order.items = items;

    logInfo('Order retrieved', { order_id: orderId });

    return order;
  } catch (error) {
    logError('Failed to get order', error, { order_id: orderId });
    throw error;
  }
}

/**
 * 주문에 결제 ID 연결
 * @param {number} orderId - 주문 ID
 * @param {string} paymentId - 결제 ID
 * @param {string} paymentMethod - 결제 수단
 * @param {Object} connection - 데이터베이스 연결 (트랜잭션용)
 * @returns {Promise<void>}
 */
async function linkPaymentToOrder(orderId, paymentId, paymentMethod, connection) {
  try {
    // 입력 검증
    if (!isValidUserId(orderId)) {
      throw new Error('Invalid order_id');
    }

    if (!paymentId || typeof paymentId !== 'string') {
      throw new Error('Invalid payment_id');
    }

    // 결제 정보 업데이트 (파라미터화된 쿼리)
    const [result] = await connection.execute(
      'UPDATE orders SET payment_id = ?, payment_method = ?, updated_at = NOW() WHERE id = ?',
      [paymentId, paymentMethod, orderId]
    );

    if (result.affectedRows === 0) {
      throw new Error('Order not found');
    }

    logInfo('Payment linked to order', {
      order_id: orderId,
      payment_id: paymentId
    });
  } catch (error) {
    logError('Failed to link payment to order', error, {
      order_id: orderId,
      payment_id: paymentId
    });
    throw error;
  }
}

export {
  createOrder,
  updateOrderStatus,
  getOrderById,
  validateOrderItems,
  linkPaymentToOrder
};
