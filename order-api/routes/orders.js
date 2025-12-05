import express from "express";
import { db } from "../../shared/db.js";

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM orders ORDER BY created_at DESC');
    return res.json({ success: true, orders: rows });
  } catch (err) {
    console.error('GET ORDERS ERROR:', err);
    return res.status(500).json({ success: false, message: 'SERVER_ERROR' });
  }
});

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

router.post('/', async (req, res) => {
  const conn = await db.getConnection();
  try {
    const { user_id, items, total_price, payment_method } = req.body;
    await conn.beginTransaction();
    const [orderResult] = await conn.query("INSERT INTO orders(user_id, total_price, status, payment_method) VALUES(?, ?, 'pending', ?)", [user_id, total_price, payment_method]);
    const orderId = orderResult.insertId;
    for (const item of items) {
      await conn.query('INSERT INTO order_items(order_id, product_id, quantity, price) VALUES(?, ?, ?, ?)', [orderId, item.id, item.quantity, item.price]);
    }
    await conn.commit();
    return res.json({ success: true, order_id: orderId });
  } catch (err) {
    await conn.rollback();
    console.error('CREATE ORDER ERROR:', err);
    return res.status(500).json({ success: false, message: 'SERVER_ERROR', error: err.message });
  } finally {
    conn.release();
  }
});

router.patch('/:id/status', async (req, res) => {
  const conn = await db.getConnection();
  try {
    const { id } = req.params;
    const { status } = req.body;
    await conn.query('UPDATE orders SET status = ? WHERE id = ?', [status, id]);
    return res.json({ success: true, message: 'STATUS_UPDATED' });
  } catch (err) {
    console.error('UPDATE ORDER STATUS ERROR:', err);
    return res.status(500).json({ success: false, message: 'SERVER_ERROR' });
  } finally {
    conn.release();
  }
});

export default router;
