import express from 'express';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { dynamoDB, TABLES } from '../../shared/dynamodb.js';
import { db } from '../../shared/db.js';

const router = express.Router();

router.post('/callback', async (req, res) => {
  try {
    const { user_id, order_id, payment_method, amount, items } = req.body;
    if (!user_id || !order_id || !payment_method) return res.status(400).json({ success: false, message: 'MISSING_FIELDS' });

    // 1) DynamoDB에 결제 정보 저장
    const paymentId = `payment-${Date.now()}`;
    const paymentStatus = 'completed';

    const paymentCommand = new PutCommand({
      TableName: TABLES.PAYMENT,
      Item: {
        payment_id: paymentId,
        user_id: String(user_id),
        order_id: String(order_id),
        payment_method,
        amount,
        status: paymentStatus,
        transaction_id: `TXN-${Date.now()}`,
        created_at: new Date().toISOString(),
      }
    });

    await dynamoDB.send(paymentCommand);

    // 2) Update MySQL directly (Merged logic)
    try {
        await db.query('UPDATE orders SET status = ?, payment_id = ? WHERE id = ?', ['paid', paymentId, order_id]);
    } catch (dbErr) {
        console.error('Failed to update order status in MySQL:', dbErr);
        return res.status(500).json({ success: false, message: 'ORDER_UPDATE_FAILED', error: dbErr.message });
    }

    return res.json({ success: true, payment_id: paymentId, status: paymentStatus });
  } catch (err) {
    console.error('Callback processing error:', err);
    return res.status(500).json({ success: false, message: 'SERVER_ERROR', error: err.message });
  }
});

export default router;
