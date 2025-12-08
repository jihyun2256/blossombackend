import express from "express";
import { db } from "../../shared/db.js";
import multer from "multer";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const s3 = new S3Client({ region: process.env.AWS_REGION || "ap-northeast-2" });
const S3_BUCKET = process.env.S3_BUCKET || "test1bipa-g3-u3";
const S3_FOLDER = "images";

router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM products ORDER BY id DESC');
    return res.json({ success: true, products: rows, count: rows.length });
  } catch (err) {
    console.error('PRODUCTS ERROR:', err);
    return res.status(500).json({ success: false, message: 'SERVER_ERROR', error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.query('SELECT * FROM products WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'PRODUCT_NOT_FOUND' });
    return res.json({ success: true, product: rows[0] });
  } catch (err) {
    console.error('GET PRODUCT ERROR:', err);
    return res.status(500).json({ success: false, message: 'SERVER_ERROR', error: err.message });
  }
});

router.post('/', upload.single('image'), async (req, res) => {
  try {
    const { name, description, category, price, stock } = req.body;
    if (!name || !price) return res.status(400).json({ success: false, message: '상품명과 가격은 필수입니다.' });
    let imageUrl = null;
    if (req.file) {
      const timestamp = Date.now();
      const safeFileName = req.file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
      const key = `${S3_FOLDER}/${timestamp}-${safeFileName}`;
      const command = new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, Body: req.file.buffer, ContentType: req.file.mimetype });
      await s3.send(command);
      imageUrl = `https://${S3_BUCKET}.s3.${process.env.AWS_REGION || 'ap-northeast-2'}.amazonaws.com/${key}`;
    }
    const [result] = await db.query(`INSERT INTO products (name, description, category, price, stock, image_url) VALUES (?, ?, ?, ?, ?, ?)`, [name, description || '', category || '기타', parseFloat(price), parseInt(stock) || 0, imageUrl]);
    return res.status(201).json({ success: true, message: 'PRODUCT_CREATED', product_id: result.insertId, image_url: imageUrl });
  } catch (err) {
    console.error('CREATE PRODUCT ERROR:', err);
    return res.status(500).json({ success: false, message: 'SERVER_ERROR', error: err.message });
  }
});

router.put('/:id', upload.single('image'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, category, price, stock } = req.body;
    const [existing] = await db.query('SELECT * FROM products WHERE id = ?', [id]);
    if (existing.length === 0) return res.status(404).json({ success: false, message: 'PRODUCT_NOT_FOUND' });
    let imageUrl = existing[0].image_url;
    if (req.file) {
      const timestamp = Date.now();
      const safeFileName = req.file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
      const key = `${S3_FOLDER}/${timestamp}-${safeFileName}`;
      const command = new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, Body: req.file.buffer, ContentType: req.file.mimetype });
      await s3.send(command);
      imageUrl = `https://${S3_BUCKET}.s3.${process.env.AWS_REGION || 'ap-northeast-2'}.amazonaws.com/${key}`;
    }
    await db.query(`UPDATE products SET name = ?, description = ?, category = ?, price = ?, stock = ?, image_url = ?, updated_at = NOW() WHERE id = ?`, [name || existing[0].name, description || existing[0].description, category || existing[0].category, parseFloat(price) || existing[0].price, parseInt(stock) || existing[0].stock, imageUrl, id]);
    return res.json({ success: true, message: 'PRODUCT_UPDATED', image_url: imageUrl });
  } catch (err) {
    console.error('UPDATE PRODUCT ERROR:', err);
    return res.status(500).json({ success: false, message: 'SERVER_ERROR', error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [existing] = await db.query('SELECT * FROM products WHERE id = ?', [id]);
    if (existing.length === 0) return res.status(404).json({ success: false, message: 'PRODUCT_NOT_FOUND' });
    await db.query('DELETE FROM products WHERE id = ?', [id]);
    return res.json({ success: true, message: 'PRODUCT_DELETED' });
  } catch (err) {
    console.error('DELETE PRODUCT ERROR:', err);
    return res.status(500).json({ success: false, message: 'SERVER_ERROR', error: err.message });
  }
});

export default router;
