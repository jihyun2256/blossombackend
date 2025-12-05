/**
 * 카드 관리 라우트
 * 사용자의 카드 정보 저장 및 관리 (마지막 4자리만 저장)
 * 🔒 보안: 전체 카드번호는 저장하지 않음
 */

import express from 'express';
import { db } from '../../shared/db.js';
import { authenticate } from '../../shared/auth.js';

const router = express.Router();

/**
 * GET /cards
 * 사용자의 저장된 카드 목록 조회
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.user_id;

    const [cards] = await db.query(
      `SELECT card_id, card_holder, card_type, last_four_digits, 
              expiry_month, expiry_year, is_default, created_at
       FROM user_cards 
       WHERE user_id = ? AND is_deleted = FALSE
       ORDER BY is_default DESC, created_at DESC`,
      [userId]
    );

    return res.json({
      success: true,
      cards: cards
    });
  } catch (err) {
    console.error('GET CARDS ERROR:', err);
    return res.status(500).json({
      success: false,
      message: 'SERVER_ERROR',
      error: err.message
    });
  }
});

/**
 * POST /cards
 * 새 카드 정보 저장 (마지막 4자리만)
 */
router.post('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { card_holder, card_type, last_four_digits, expiry_month, expiry_year, is_default } = req.body;

    // 필수 필드 검증
    if (!card_holder || !card_type || !last_four_digits || !expiry_month || !expiry_year) {
      return res.status(400).json({
        success: false,
        message: 'MISSING_FIELDS',
        error: '모든 카드 정보를 입력해주세요'
      });
    }

    // 마지막 4자리 검증
    if (!/^\d{4}$/.test(last_four_digits)) {
      return res.status(400).json({
        success: false,
        message: 'INVALID_CARD_NUMBER',
        error: '카드번호 마지막 4자리를 입력해주세요'
      });
    }

    // 만료일 검증
    const month = parseInt(expiry_month);
    const year = parseInt(expiry_year);
    
    if (month < 1 || month > 12) {
      return res.status(400).json({
        success: false,
        message: 'INVALID_EXPIRY',
        error: '유효하지 않은 만료 월입니다'
      });
    }

    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    
    if (year < currentYear || (year === currentYear && month < currentMonth)) {
      return res.status(400).json({
        success: false,
        message: 'CARD_EXPIRED',
        error: '만료된 카드입니다'
      });
    }

    // 기본 카드로 설정하는 경우, 기존 기본 카드 해제
    if (is_default) {
      await db.query(
        'UPDATE user_cards SET is_default = FALSE WHERE user_id = ?',
        [userId]
      );
    }

    // 카드 정보 저장
    const [result] = await db.query(
      `INSERT INTO user_cards 
       (user_id, card_holder, card_type, last_four_digits, expiry_month, expiry_year, is_default)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, card_holder, card_type, last_four_digits, expiry_month, expiry_year, is_default || false]
    );

    return res.status(201).json({
      success: true,
      message: 'CARD_SAVED',
      card: {
        card_id: result.insertId,
        card_holder,
        card_type,
        last_four_digits,
        expiry_month,
        expiry_year,
        is_default: is_default || false
      }
    });
  } catch (err) {
    console.error('SAVE CARD ERROR:', err);
    return res.status(500).json({
      success: false,
      message: 'SERVER_ERROR',
      error: err.message
    });
  }
});

/**
 * PUT /cards/:cardId/default
 * 기본 카드 설정
 */
router.put('/:cardId/default', authenticate, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { cardId } = req.params;

    // 카드 소유권 확인
    const [cards] = await db.query(
      'SELECT card_id FROM user_cards WHERE card_id = ? AND user_id = ? AND is_deleted = FALSE',
      [cardId, userId]
    );

    if (cards.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'CARD_NOT_FOUND',
        error: '카드를 찾을 수 없습니다'
      });
    }

    // 기존 기본 카드 해제
    await db.query(
      'UPDATE user_cards SET is_default = FALSE WHERE user_id = ?',
      [userId]
    );

    // 새 기본 카드 설정
    await db.query(
      'UPDATE user_cards SET is_default = TRUE WHERE card_id = ?',
      [cardId]
    );

    return res.json({
      success: true,
      message: 'DEFAULT_CARD_UPDATED'
    });
  } catch (err) {
    console.error('UPDATE DEFAULT CARD ERROR:', err);
    return res.status(500).json({
      success: false,
      message: 'SERVER_ERROR',
      error: err.message
    });
  }
});

/**
 * DELETE /cards/:cardId
 * 카드 삭제 (소프트 삭제)
 */
router.delete('/:cardId', authenticate, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { cardId } = req.params;

    // 카드 소유권 확인
    const [cards] = await db.query(
      'SELECT card_id FROM user_cards WHERE card_id = ? AND user_id = ? AND is_deleted = FALSE',
      [cardId, userId]
    );

    if (cards.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'CARD_NOT_FOUND',
        error: '카드를 찾을 수 없습니다'
      });
    }

    // 소프트 삭제
    await db.query(
      'UPDATE user_cards SET is_deleted = TRUE, deleted_at = NOW() WHERE card_id = ?',
      [cardId]
    );

    return res.json({
      success: true,
      message: 'CARD_DELETED'
    });
  } catch (err) {
    console.error('DELETE CARD ERROR:', err);
    return res.status(500).json({
      success: false,
      message: 'SERVER_ERROR',
      error: err.message
    });
  }
});

export default router;
