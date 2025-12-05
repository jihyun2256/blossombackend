import express from "express";
import { PutCommand, GetCommand, UpdateCommand, DeleteCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { dynamoDB, TABLES } from "../../shared/dynamodb.js";

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { user_id, product_id, product_name, price, quantity } = req.body;
    if (!user_id || !product_id || !quantity) return res.status(400).json({ success: false, message: 'MISSING_FIELDS' });
    const cartId = `${user_id}#${product_id}`;
    const command = new PutCommand({ TableName: TABLES.CART, Item: { cart_id: cartId, user_id, product_id, product_name, price, quantity, created_at: new Date().toISOString(), updated_at: new Date().toISOString() } });
    await dynamoDB.send(command);
    return res.json({ success: true, message: 'ITEM_ADDED_TO_CART' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'SERVER_ERROR', error: err.message });
  }
});

router.get('/user/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    const command = new QueryCommand({ TableName: TABLES.CART, IndexName: 'user_id-index', KeyConditionExpression: 'user_id = :userId', ExpressionAttributeValues: { ':userId': userId } });
    const result = await dynamoDB.send(command);
    return res.json({ success: true, items: result.Items || [] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'SERVER_ERROR', error: err.message });
  }
});

router.put('/:userId/:productId', async (req, res) => {
  try {
    const { userId, productId } = req.params;
    const { quantity } = req.body;
    if (!quantity || quantity < 1) return res.status(400).json({ success: false, message: 'INVALID_QUANTITY' });
    const cartId = `${userId}#${productId}`;
    const command = new UpdateCommand({ TableName: TABLES.CART, Key: { cart_id: cartId }, UpdateExpression: 'SET quantity = :quantity, updated_at = :updated_at', ExpressionAttributeValues: { ':quantity': quantity, ':updated_at': new Date().toISOString() }, ReturnValues: 'ALL_NEW' });
    const result = await dynamoDB.send(command);
    return res.json({ success: true, item: result.Attributes });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'SERVER_ERROR', error: err.message });
  }
});

router.delete('/:userId/:productId', async (req, res) => {
  try {
    const { userId, productId } = req.params;
    const cartId = `${userId}#${productId}`;
    const command = new DeleteCommand({ TableName: TABLES.CART, Key: { cart_id: cartId } });
    await dynamoDB.send(command);
    return res.json({ success: true, message: 'ITEM_REMOVED_FROM_CART' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'SERVER_ERROR', error: err.message });
  }
});

router.delete('/user/:userId/clear', async (req, res) => {
  try {
    const userId = req.params.userId;
    const queryCommand = new QueryCommand({ TableName: TABLES.CART, IndexName: 'user_id-index', KeyConditionExpression: 'user_id = :userId', ExpressionAttributeValues: { ':userId': userId } });
    const queryResult = await dynamoDB.send(queryCommand);
    const deletePromises = (queryResult.Items || []).map((item) => dynamoDB.send(new DeleteCommand({ TableName: TABLES.CART, Key: { cart_id: item.cart_id } })));
    await Promise.all(deletePromises);
    return res.json({ success: true, message: 'CART_CLEARED', deleted_count: deletePromises.length });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'SERVER_ERROR', error: err.message });
  }
});

export default router;
