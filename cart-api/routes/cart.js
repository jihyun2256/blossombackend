import express from "express";
import { db } from "../../shared/db.js";
import redis from "../config/redis.js";

const router = express.Router();

// POST /cart - 장바구니에 상품 추가
router.post('/', async (req, res) => {
  try {
    const { user_id, product_id, product_name, price, quantity } = req.body;
    
    if (!user_id || !product_id || !quantity) {
      return res.status(400).json({ success: false, message: 'MISSING_FIELDS' });
    }

    const [result] = await db.query(
      'INSERT INTO cart (user_id, product_id, product_name, price, quantity) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE quantity = quantity + ?, updated_at = NOW()',
      [user_id, product_id, product_name, price, quantity, quantity]
    );
    // 장바구니 변경 시 캐시 무효화
    try {
      await redis.del(`cart:${user_id}`);
    } catch (redisErr) {
      console.error('Redis error on cart invalidate:', redisErr);
    }

    return res.json({ success: true, message: 'ITEM_ADDED_TO_CART' });
  } catch (err) {
    console.error('ADD TO CART ERROR:', err);
    return res.status(500).json({ success: false, message: 'SERVER_ERROR', error: err.message });
  }
});

// GET /cart/user/:userId - 사용자 장바구니 조회
router.get('/user/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    const cacheKey = `cart:${userId}`;

    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return res.json({ success: true, items: JSON.parse(cached), source: 'cache' });
      }
    } catch (redisErr) {
      console.error('Redis error on cart get cache:', redisErr);
    }

    const [rows] = await db.query(
      'SELECT * FROM cart WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );

    try {
      await redis.set(cacheKey, JSON.stringify(rows || []), { EX: 300 }); // 5분 캐시
    } catch (redisErr) {
      console.error('Redis error on cart set cache:', redisErr);
    }

    return res.json({ success: true, items: rows || [], source: 'db' });
  } catch (err) {
    console.error('GET CART ERROR:', err);
    return res.status(500).json({ success: false, message: 'SERVER_ERROR', error: err.message });
  }
});

// PUT /cart/:userId/:productId - 장바구니 상품 수량 수정
router.put('/:userId/:productId', async (req, res) => {
  try {
    const { userId, productId } = req.params;
    const { quantity } = req.body;

    if (!quantity || quantity < 1) {
      return res.status(400).json({ success: false, message: 'INVALID_QUANTITY' });
    }

    const [result] = await db.query(
      'UPDATE cart SET quantity = ?, updated_at = NOW() WHERE user_id = ? AND product_id = ?',
      [quantity, userId, productId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'CART_ITEM_NOT_FOUND' });
    }

    // 장바구니 캐시 무효화
    try {
      await redis.del(`cart:${userId}`);
    } catch (redisErr) {
      console.error('Redis error on cart invalidate:', redisErr);
    }

    return res.json({ success: true, message: 'QUANTITY_UPDATED' });
  } catch (err) {
    console.error('UPDATE CART ERROR:', err);
    return res.status(500).json({ success: false, message: 'SERVER_ERROR', error: err.message });
  }
});

// DELETE /cart/:userId/:productId - 장바구니에서 상품 제거
router.delete('/:userId/:productId', async (req, res) => {
  try {
    const { userId, productId } = req.params;

    const [result] = await db.query(
      'DELETE FROM cart WHERE user_id = ? AND product_id = ?',
      [userId, productId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'CART_ITEM_NOT_FOUND' });
    }

    // 장바구니 캐시 무효화
    try {
      await redis.del(`cart:${userId}`);
    } catch (redisErr) {
      console.error('Redis error on cart invalidate:', redisErr);
    }

    return res.json({ success: true, message: 'ITEM_REMOVED_FROM_CART' });
  } catch (err) {
    console.error('DELETE CART ITEM ERROR:', err);
    return res.status(500).json({ success: false, message: 'SERVER_ERROR', error: err.message });
  }
});

// DELETE /cart/user/:userId/clear - 장바구니 전체 비우기
router.delete('/user/:userId/clear', async (req, res) => {
  try {
    const userId = req.params.userId;

    const [result] = await db.query(
      'DELETE FROM cart WHERE user_id = ?',
      [userId]
    );

    // 장바구니 캐시 무효화
    try {
      await redis.del(`cart:${userId}`);
    } catch (redisErr) {
      console.error('Redis error on cart invalidate:', redisErr);
    }

    return res.json({ success: true, message: 'CART_CLEARED', deleted_count: result.affectedRows });
  } catch (err) {
    console.error('CLEAR CART ERROR:', err);
    return res.status(500).json({ success: false, message: 'SERVER_ERROR', error: err.message });
  }
});

export default router;
