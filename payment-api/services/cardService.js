/**
 * 카드 결제 서비스
 * 카드 정보 처리 및 결제 로직
 * 요구사항: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6
 */

import { logInfo, logError, maskSensitiveData } from '../utils/logger.js';
import { isValidCardNumber, isValidCVV, isValidExpiry } from '../utils/validator.js';

/**
 * 카드 결제 처리
 * @param {Object} cardData - 카드 정보 { card_number, card_holder, expiry, cvv, saved_card_id }
 * @param {number} amount - 결제 금액
 * @param {number} orderId - 주문 ID
 * @returns {Promise<Object>} - { success: boolean, transactionId?: string, error?: string }
 */
async function processCardPayment(cardData, amount, orderId) {
  try {
    // 카드 정보 검증
    if (!cardData) {
      throw new Error('Card data is required');
    }

    const { card_number, card_holder, expiry, cvv, saved_card_id } = cardData;

    // saved_card_id가 있으면 저장된 카드 사용
    if (saved_card_id) {
      logInfo('Processing payment with saved card', {
        order_id: orderId,
        saved_card_id,
        amount
      });

      // 저장된 카드로 결제 처리 (실제 구현에서는 결제 게이트웨이 호출)
      const transactionId = generateTransactionId();
      
      logInfo('Saved card payment processed', {
        order_id: orderId,
        transaction_id: transactionId,
        amount
      });

      return {
        success: true,
        transactionId,
        cardType: 'saved'
      };
    }

    // 새 카드 정보 검증
    if (!card_number || !card_holder || !expiry || !cvv) {
      throw new Error('Missing required card information');
    }

    // 카드 번호 검증
    if (!isValidCardNumber(card_number)) {
      throw new Error('Invalid card number');
    }

    // CVV 검증
    if (!isValidCVV(cvv)) {
      throw new Error('Invalid CVV');
    }

    // 만료일 검증
    if (!isValidExpiry(expiry)) {
      throw new Error('Invalid expiry date');
    }

    logInfo('Processing new card payment', {
      order_id: orderId,
      card_holder,
      amount,
      card_last4: card_number.slice(-4)
    });

    // 카드 결제 처리 (실제 구현에서는 결제 게이트웨이 호출)
    const transactionId = generateTransactionId();

    logInfo('Card payment processed successfully', {
      order_id: orderId,
      transaction_id: transactionId,
      amount,
      card_last4: card_number.slice(-4)
    });

    return {
      success: true,
      transactionId,
      cardType: 'new',
      cardLast4: card_number.slice(-4)
    };

  } catch (error) {
    logError('Card payment processing failed', error, {
      order_id: orderId,
      amount,
      error_message: error.message
    });

    return {
      success: false,
      error: error.message || 'Card payment failed'
    };
  }
}

/**
 * 트랜잭션 ID 생성
 * @returns {string} - 트랜잭션 ID
 */
function generateTransactionId() {
  return `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
}

/**
 * 카드 정보 마스킹
 * @param {Object} cardData - 카드 정보
 * @returns {Object} - 마스킹된 카드 정보
 */
function maskCardData(cardData) {
  if (!cardData) return null;

  return {
    card_number: cardData.card_number ? `****-****-****-${cardData.card_number.slice(-4)}` : null,
    card_holder: cardData.card_holder,
    expiry: cardData.expiry,
    cvv: '***'
  };
}

export {
  processCardPayment,
  generateTransactionId,
  maskCardData
};
