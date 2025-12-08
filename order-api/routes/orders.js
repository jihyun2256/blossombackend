import express from "express";
import { db } from "../../shared/db.js";

const router = express.Router();

// ============================================
// 📦 주문 관리 API
// ============================================

/**
 * GET /orders
 * 모든 주문 조회 (관리자용)
 */
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM orders ORDER BY created_at DESC');
    return res.json({ success: true, orders: rows });
  } catch (err) {
    console.error('GET ORDERS ERROR:', err);
    return res.status(500).json({ success: false, message: 'SERVER_ERROR' });
  }
});

/**
 * GET /orders/user/:userId
 * 사용자별 주문 조회
 */
router.get('/user/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    const [rows] = await db.query('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC', [userId]);
    return res.json({ success: true, orders: rows });
  } catch (err) {
    console.error('GET USER ORDERS ERROR:', err);
    return res.status(500).json({ success: false, message: 'SERVER_ERROR' });
  }
});

/**
 * POST /orders
 * 새 주문 생성
 */
router.post('/', async (req, res) => {
  const conn = await db.getConnection();
  try {
    const { user_id, items, total_price } = req.body;

    // 입력 검증
    if (!user_id || !items || !total_price) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields: user_id, items, total_price' 
      });
    }

    await conn.beginTransaction();

    // 주문 생성
    const [orderResult] = await conn.query(
      "INSERT INTO orders(user_id, total_price, status) VALUES(?, ?, 'pending')", 
      [user_id, total_price]
    );
    const orderId = orderResult.insertId;

    // 주문 항목 추가
    for (const item of items) {
      await conn.query(
        'INSERT INTO order_items(order_id, product_id, quantity, price) VALUES(?, ?, ?, ?)', 
        [orderId, item.product_id, item.quantity, item.price]
      );
    }

    await conn.commit();

    return res.status(201).json({ 
      success: true, 
      order_id: orderId,
      message: 'Order created successfully'
    });
  } catch (err) {
    await conn.rollback();
    console.error('CREATE ORDER ERROR:', err);
    return res.status(500).json({ 
      success: false, 
      message: 'SERVER_ERROR', 
      error: err.message 
    });
  } finally {
    conn.release();
  }
});

/**
 * GET /orders/:id
 * 주문 상세 조회
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [orders] = await db.query('SELECT * FROM orders WHERE id = ?', [id]);
    
    if (orders.length === 0) {
      return res.status(404).json({ success: false, message: 'ORDER_NOT_FOUND' });
    }

    const order = orders[0];
    const [items] = await db.query('SELECT * FROM order_items WHERE order_id = ?', [id]);

    return res.json({ 
      success: true, 
      order: { ...order, items } 
    });
  } catch (err) {
    console.error('GET ORDER ERROR:', err);
    return res.status(500).json({ success: false, message: 'SERVER_ERROR' });
  }
});

/**
 * PATCH /orders/:id/status
 * 주문 상태 업데이트
 */
router.patch('/:id/status', async (req, res) => {
  const conn = await db.getConnection();
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ success: false, message: 'Status is required' });
    }

    await conn.query('UPDATE orders SET status = ?, updated_at = NOW() WHERE id = ?', [status, id]);
    
    return res.json({ 
      success: true, 
      message: 'Order status updated successfully'
    });
  } catch (err) {
    console.error('UPDATE ORDER STATUS ERROR:', err);
    return res.status(500).json({ success: false, message: 'SERVER_ERROR' });
  } finally {
    conn.release();
  }
});

export default router;
