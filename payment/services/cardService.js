/**
 * 카드 결제 서비스
 * 카드 정보 검증 및 토큰화
 * 🔒 보안: 카드 정보는 메모리에서만 처리, DB 저장 금지
 */

import crypto from 'crypto';
import { logInfo, logError } from '../utils/logger.js';

/**
 * 카드번호 검증 (Luhn 알고리즘)
 * @param {string} cardNumber - 카드번호
 * @returns {boolean} - 유효 여부
 */
function validateCardNumber(cardNumber) {
  // 숫자만 추출
  const digits = cardNumber.replace(/\D/g, '');
  
  // 길이 확인 (13-19자리)
  if (digits.length < 13 || digits.length > 19) {
    return false;
  }
  
  // Luhn 알고리즘
  let sum = 0;
  let isEven = false;
  
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits[i]);
    
    if (isEven) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }
    
    sum += digit;
    isEven = !isEven;
  }
  
  return sum % 10 === 0;
}

/**
 * CVV 검증
 * @param {string} cvv - CVV
 * @returns {boolean} - 유효 여부
 */
function validateCVV(cvv) {
  // 3-4자리 숫자
  return /^\d{3,4}$/.test(cvv);
}

/**
 * 만료일 검증
 * @param {string} expiry - 만료일 (MM/YY 또는 MMYY)
 * @returns {boolean} - 유효 여부
 */
function validateExpiry(expiry) {
  // MM/YY 또는 MMYY 형식
  const cleaned = expiry.replace(/\D/g, '');
  
  if (cleaned.length !== 4) {
    return false;
  }
  
  const month = parseInt(cleaned.substring(0, 2));
  const year = parseInt('20' + cleaned.substring(2, 4));
  
  // 월 범위 확인
  if (month < 1 || month > 12) {
    return false;
  }
  
  // 만료일 확인 (해당 월의 마지막 날까지 유효)
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 0-based to 1-based
  
  // 연도 비교
  if (year > currentYear) {
    return true; // 미래 연도는 유효
  }
  
  if (year < currentYear) {
    return false; // 과거 연도는 만료
  }
  
  // 같은 연도인 경우 월 비교
  return month >= currentMonth;
}

/**
 * 카드 타입 감지
 * @param {string} cardNumber - 카드번호
 * @returns {string} - 카드 타입
 */
function detectCardType(cardNumber) {
  const digits = cardNumber.replace(/\D/g, '');
  
  // Visa
  if (/^4/.test(digits)) {
    return 'visa';
  }
  
  // Mastercard
  if (/^5[1-5]/.test(digits) || /^2[2-7]/.test(digits)) {
    return 'mastercard';
  }
  
  // American Express
  if (/^3[47]/.test(digits)) {
    return 'amex';
  }
  
  // Discover
  if (/^6(?:011|5)/.test(digits)) {
    return 'discover';
  }
  
  return 'unknown';
}

/**
 * 카드 정보 검증
 * @param {Object} cardData - 카드 정보
 * @param {boolean} isSavedCard - 저장된 카드 여부
 * @returns {Object} - 검증 결과
 */
export function validateCardData(cardData, isSavedCard = false) {
  const errors = [];
  
  // 저장된 카드인지 확인 (saved_card_id가 있거나 카드번호가 마스킹된 경우)
  const isUsingSavedCard = isSavedCard || cardData.saved_card_id || (cardData.card_number && cardData.card_number.includes('*'));
  
  // 카드번호 검증 (저장된 카드가 아닌 경우만)
  if (!isUsingSavedCard) {
    if (!cardData.card_number) {
      errors.push('카드번호는 필수입니다');
    } else {
      // 테스트 모드: 모든 카드번호 허용 (개발/테스트 환경)
      // 프로덕션 환경에서는 validateCardNumber() 사용
      const isTestMode = process.env.NODE_ENV !== 'production';
      
      if (isTestMode) {
        // 테스트 모드: 최소 검증만 수행 (13-19자리 숫자)
        const cleanCardNumber = cardData.card_number.replace(/\s/g, '');
        if (!/^\d{13,19}$/.test(cleanCardNumber)) {
          errors.push('카드번호는 13-19자리 숫자여야 합니다');
        }
      } else {
        // 프로덕션 모드: 엄격한 검증
        if (!validateCardNumber(cardData.card_number)) {
          errors.push('유효하지 않은 카드번호입니다');
        }
      }
    }
  } else {
    // 저장된 카드의 경우 마지막 4자리만 확인
    if (!cardData.card_number) {
      errors.push('카드 정보가 필요합니다');
    }
  }
  
  // CVV 검증 (항상 필요)
  if (!cardData.cvv) {
    errors.push('CVV는 필수입니다');
  } else if (!validateCVV(cardData.cvv)) {
    errors.push('유효하지 않은 CVV입니다 (3-4자리 숫자)');
  }
  
  // 만료일 검증
  if (!cardData.expiry) {
    errors.push('만료일은 필수입니다');
  } else if (!validateExpiry(cardData.expiry)) {
    // 디버깅 정보 추가
    const cleaned = cardData.expiry.replace(/\D/g, '');
    const month = parseInt(cleaned.substring(0, 2));
    const year = parseInt('20' + cleaned.substring(2, 4));
    errors.push(`유효하지 않거나 만료된 카드입니다 (입력: ${cardData.expiry}, 해석: ${year}년 ${month}월)`);
  }
  
  // 카드 소유자 이름 검증
  if (!cardData.card_holder) {
    errors.push('카드 소유자 이름은 필수입니다');
  } else if (cardData.card_holder.length < 2) {
    errors.push('카드 소유자 이름이 너무 짧습니다');
  }
  
  if (errors.length > 0) {
    return {
      valid: false,
      errors
    };
  }
  
  // 카드 타입 감지 (저장된 카드가 아닌 경우만)
  let cardType = 'unknown';
  if (!isUsingSavedCard && cardData.card_number) {
    cardType = detectCardType(cardData.card_number);
  }
  
  return {
    valid: true,
    cardType: cardType
  };
}

/**
 * 카드 정보 토큰화 (결제 게이트웨이 시뮬레이션)
 * 🔒 실제 환경에서는 외부 결제 게이트웨이 API 호출
 * @param {Object} cardData - 카드 정보
 * @param {number} amount - 결제 금액
 * @param {boolean} isSavedCard - 저장된 카드 여부
 * @returns {Promise<Object>} - 토큰화 결과
 */
export async function tokenizeCard(cardData, amount, isSavedCard = false) {
  try {
    // 저장된 카드인지 확인
    const isUsingSavedCard = isSavedCard || cardData.saved_card_id || (cardData.card_number && cardData.card_number.includes('*'));
    
    // 🔒 보안: 카드 정보 검증
    const validation = validateCardData(cardData, isUsingSavedCard);
    
    if (!validation.valid) {
      logError('Card validation failed', null, {
        errors: validation.errors
      });
      
      return {
        success: false,
        error: validation.errors.join(', ')
      };
    }
    
    // 🔒 카드 정보는 로그에 남기지 않음 (마스킹도 안 함)
    logInfo('Card tokenization started', {
      card_type: validation.cardType || 'saved_card',
      amount,
      is_saved_card: isUsingSavedCard
    });
    
    // 실제 환경에서는 여기서 결제 게이트웨이 API 호출
    // 예: Stripe, PayPal, Toss Payments 등
    
    // 🔒 마지막 4자리 저장 (카드 정보 제거 전에)
    const lastFour = getLastFourDigits(cardData.card_number);
    
    // 시뮬레이션: 토큰 생성 (카드 정보 제거 전에)
    const tokenData = {
      card_number: cardData.card_number || 'saved_card',
      cvv: cardData.cvv || '000',
      timestamp: Date.now()
    };
    const hash = crypto.createHash('sha256')
      .update(tokenData.card_number + tokenData.cvv + tokenData.timestamp)
      .digest('hex');
    const token = `tok_${hash.substring(0, 32)}`;
    const transactionId = `TXN_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
    
    // 🔒 카드 정보는 즉시 메모리에서 제거
    // (JavaScript는 가비지 컬렉션이 자동이지만 명시적으로 null 처리)
    cardData.card_number = null;
    cardData.cvv = null;
    cardData.expiry = null;
    
    // 결제 승인 시뮬레이션 (100% 성공률 - 테스트용)
    // 실제 환경에서는 결제 게이트웨이의 응답에 따라 결정됨
    const isApproved = true; // Math.random() > 0.1;
    
    if (isApproved) {
      // 카드 타입 결정 (저장된 카드의 경우 'saved_card', 그 외는 감지된 타입)
      const finalCardType = validation.cardType || (isUsingSavedCard ? 'saved_card' : 'unknown');
      
      logInfo('Card payment approved', {
        transaction_id: transactionId,
        card_type: finalCardType,
        is_saved_card: isUsingSavedCard
      });
      
      return {
        success: true,
        token,
        transactionId,
        cardType: finalCardType,
        lastFourDigits: lastFour
      };
    } else {
      logError('Card payment declined', null, {
        card_type: validation.cardType || 'unknown',
        is_saved_card: isUsingSavedCard
      });
      
      return {
        success: false,
        error: '카드사에서 결제를 거부했습니다'
      };
    }
    
  } catch (error) {
    console.error('❌ Card Tokenization Error:', error);
    logError('Card tokenization failed', error, {
      error_message: error.message,
      error_stack: error.stack
    });
    
    return {
      success: false,
      error: error.message || '카드 처리 중 오류가 발생했습니다'
    };
  }
}

/**
 * 보안 토큰 생성
 * @param {Object} cardData - 카드 정보
 * @returns {string} - 토큰
 */
function generateSecureToken(cardData) {
  // 실제 환경에서는 결제 게이트웨이에서 생성된 토큰 사용
  const hash = crypto.createHash('sha256')
    .update(cardData.card_number + cardData.cvv + Date.now())
    .digest('hex');
  
  return `tok_${hash.substring(0, 32)}`;
}

/**
 * 카드번호 마지막 4자리 추출
 * @param {string} cardNumber - 카드번호
 * @returns {string} - 마지막 4자리
 */
function getLastFourDigits(cardNumber) {
  if (!cardNumber) return '****';
  const digits = cardNumber.replace(/\D/g, '');
  return digits.slice(-4);
}

/**
 * 카드 정보로 결제 처리
 * @param {Object} cardData - 카드 정보
 * @param {number} amount - 결제 금액
 * @param {string} orderId - 주문 ID
 * @returns {Promise<Object>} - 결제 결과
 */
export async function processCardPayment(cardData, amount, orderId) {
  try {
    // 저장된 카드인지 확인
    const isSavedCard = cardData.saved_card_id || (cardData.card_number && cardData.card_number.includes('*'));
    
    // 1. 카드 정보 토큰화
    const tokenResult = await tokenizeCard(cardData, amount, isSavedCard);
    
    if (!tokenResult.success) {
      return {
        success: false,
        error: tokenResult.error
      };
    }
    
    // 2. 결제 승인
    logInfo('Card payment processing', {
      order_id: orderId,
      amount,
      card_type: tokenResult.cardType,
      last_four: tokenResult.lastFourDigits,
      is_saved_card: isSavedCard
    });
    
    // 🔒 카드 정보는 여기서 완전히 제거됨
    // 토큰과 거래 ID만 반환
    return {
      success: true,
      transactionId: tokenResult.transactionId,
      cardType: tokenResult.cardType,
      lastFourDigits: tokenResult.lastFourDigits,
      token: tokenResult.token
    };
    
  } catch (error) {
    console.error('❌ Card Payment Error:', error);
    logError('Card payment processing failed', error, {
      order_id: orderId,
      error_message: error.message,
      error_stack: error.stack
    });
    
    return {
      success: false,
      error: error.message || '결제 처리 중 오류가 발생했습니다'
    };
  }
}
