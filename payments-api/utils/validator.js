/**
 * 검증 유틸리티
 * 입력 값 검증 및 SQL Injection 방지
 * 요구사항: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6
 */

/**
 * 사용자 ID 검증
 * @param {*} userId - 검증할 사용자 ID
 * @returns {boolean} - 유효성 여부
 */
function isValidUserId(userId) {
  if (userId === null || userId === undefined) {
    return false;
  }
  
  const id = Number(userId);
  return Number.isInteger(id) && id > 0;
}

/**
 * 금액 검증 (양수, 범위)
 * @param {*} amount - 검증할 금액
 * @returns {boolean} - 유효성 여부
 */
function isValidAmount(amount) {
  if (amount === null || amount === undefined) {
    return false;
  }
  
  const num = Number(amount);
  
  // 숫자 여부 확인
  if (isNaN(num) || !isFinite(num)) {
    return false;
  }
  
  // 양수 확인 및 범위 확인 (0.01 ~ 10,000,000)
  return num > 0 && num <= 10000000 && num >= 0.01;
}

/**
 * 결제 수단 검증
 * @param {string} method - 검증할 결제 수단
 * @returns {boolean} - 유효성 여부
 */
function isValidPaymentMethod(method) {
  if (!method || typeof method !== 'string') {
    return false;
  }
  
  const validMethods = [
    'card', 
    'credit_card',      // 신용카드
    'debit_card',       // 체크카드
    'bank_transfer',    // 계좌이체
    'mobile',           // 모바일 결제
    'paypal'            // PayPal
  ];
  return validMethods.includes(method.toLowerCase());
}

/**
 * Idempotency key 형식 검증 (UUID v4)
 * @param {string} key - 검증할 Idempotency key
 * @returns {boolean} - 유효성 여부
 */
function isValidIdempotencyKey(key) {
  if (!key || typeof key !== 'string') {
    return false;
  }
  
  // UUID v4 형식 검증
  const uuidV4Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidV4Pattern.test(key);
}

/**
 * SQL Injection 패턴 감지
 * @param {string} input - 검증할 입력 값
 * @returns {boolean} - SQL Injection 패턴 발견 여부 (true = 위험)
 */
function detectSQLInjection(input) {
  if (!input || typeof input !== 'string') {
    return false;
  }
  
  // SQL Injection 패턴 목록
  const sqlPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE|UNION|DECLARE)\b)/i,
    /(--|\;|\/\*|\*\/)/,
    /('|(\\')|(\\")|(\\\\))/,
    /(\bOR\b.*=.*)/i,
    /(\bAND\b.*=.*)/i,
    /(1=1|1='1'|'=')/i,
    /(\bxp_|\bsp_)/i
  ];
  
  return sqlPatterns.some(pattern => pattern.test(input));
}

/**
 * 입력 값 정제 (위험한 문자 제거)
 * @param {string} input - 정제할 입력 값
 * @returns {string} - 정제된 입력 값
 */
function sanitizeInput(input) {
  if (!input || typeof input !== 'string') {
    return input;
  }
  
  // HTML 태그 제거
  let sanitized = input.replace(/<[^>]*>/g, '');
  
  // 특수 문자 이스케이프
  sanitized = sanitized.replace(/[<>'"]/g, '');
  
  // 앞뒤 공백 제거
  sanitized = sanitized.trim();
  
  return sanitized;
}

/**
 * 문자열 길이 검증
 * @param {string} str - 검증할 문자열
 * @param {number} maxLength - 최대 길이
 * @returns {boolean} - 유효성 여부
 */
function isValidLength(str, maxLength) {
  if (!str || typeof str !== 'string') {
    return false;
  }
  
  return str.length > 0 && str.length <= maxLength;
}

/**
 * 이메일 형식 검증
 * @param {string} email - 검증할 이메일
 * @returns {boolean} - 유효성 여부
 */
function isValidEmail(email) {
  if (!email || typeof email !== 'string') {
    return false;
  }
  
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailPattern.test(email) && email.length <= 255;
}

/**
 * 전화번호 형식 검증
 * @param {string} phone - 검증할 전화번호
 * @returns {boolean} - 유효성 여부
 */
function isValidPhone(phone) {
  if (!phone || typeof phone !== 'string') {
    return false;
  }
  
  // 숫자와 하이픈만 허용
  const phonePattern = /^[0-9-]+$/;
  return phonePattern.test(phone) && phone.length >= 10 && phone.length <= 20;
}

/**
 * 주문 항목 배열 검증
 * @param {Array} items - 검증할 주문 항목 배열
 * @returns {boolean} - 유효성 여부
 */
function isValidOrderItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return false;
  }
  
  // 각 항목 검증
  return items.every(item => {
    return (
      item &&
      typeof item === 'object' &&
      isValidUserId(item.product_id) &&
      Number.isInteger(Number(item.quantity)) &&
      Number(item.quantity) > 0 &&
      isValidAmount(item.price)
    );
  });
}

/**
 * 카드 번호 검증 (Luhn 알고리즘)
 * @param {string} cardNumber - 검증할 카드 번호
 * @returns {boolean} - 유효성 여부
 */
function isValidCardNumber(cardNumber) {
  if (!cardNumber || typeof cardNumber !== 'string') {
    return false;
  }
  
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
    let digit = parseInt(digits[i], 10);
    
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
 * @param {string} cvv - 검증할 CVV
 * @returns {boolean} - 유효성 여부
 */
function isValidCVV(cvv) {
  if (!cvv || typeof cvv !== 'string') {
    return false;
  }
  
  // 3-4자리 숫자
  const cvvPattern = /^\d{3,4}$/;
  return cvvPattern.test(cvv);
}

/**
 * 카드 만료일 검증 (MM/YY 형식)
 * @param {string} expiry - 검증할 만료일
 * @returns {boolean} - 유효성 여부
 */
function isValidExpiry(expiry) {
  if (!expiry || typeof expiry !== 'string') {
    return false;
  }
  
  // MM/YY 형식 확인
  const expiryPattern = /^(0[1-9]|1[0-2])\/\d{2}$/;
  if (!expiryPattern.test(expiry)) {
    return false;
  }
  
  // 만료일 확인
  const [month, year] = expiry.split('/');
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear() % 100;
  const currentMonth = currentDate.getMonth() + 1;
  
  const expiryYear = parseInt(year, 10);
  const expiryMonth = parseInt(month, 10);
  
  // 과거 날짜 확인
  if (expiryYear < currentYear || (expiryYear === currentYear && expiryMonth < currentMonth)) {
    return false;
  }
  
  return true;
}

/**
 * 카드 소유자명 검증
 * @param {string} cardHolder - 검증할 카드 소유자명
 * @returns {boolean} - 유효성 여부
 */
function isValidCardHolder(cardHolder) {
  if (!cardHolder || typeof cardHolder !== 'string') {
    return false;
  }
  
  // 2-50자리, 알파벳과 공백만 허용
  const cardHolderPattern = /^[A-Za-z\s]{2,50}$/;
  return cardHolderPattern.test(cardHolder);
}

export {
  isValidUserId,
  isValidAmount,
  isValidPaymentMethod,
  isValidIdempotencyKey,
  detectSQLInjection,
  sanitizeInput,
  isValidLength,
  isValidEmail,
  isValidPhone,
  isValidOrderItems,
  isValidCardNumber,
  isValidCVV,
  isValidExpiry,
  isValidCardHolder
};
