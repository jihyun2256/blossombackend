/**
 * 로거 유틸리티 (민감정보 마스킹 포함)
 * 민감정보 마스킹 로거
 * 요구사항: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6
 */

/**
 * 카드번호 마스킹 (마지막 4자리만 표시)
 * @param {string} cardNumber - 카드번호
 * @returns {string} - 마스킹된 카드번호
 */
function maskCardNumber(cardNumber) {
  if (!cardNumber || typeof cardNumber !== 'string') {
    return cardNumber;
  }
  
  // 숫자만 추출
  const digits = cardNumber.replace(/\D/g, '');
  
  if (digits.length < 4) {
    return '****';
  }
  
  const lastFour = digits.slice(-4);
  return `****-****-****-${lastFour}`;
}

/**
 * 이메일 마스킹 (첫 글자와 도메인만 표시)
 * @param {string} email - 이메일 주소
 * @returns {string} - 마스킹된 이메일
 */
function maskEmail(email) {
  if (!email || typeof email !== 'string') {
    return email;
  }
  
  const atIndex = email.indexOf('@');
  if (atIndex <= 0) {
    return '***';
  }
  
  const username = email.substring(0, atIndex);
  const domain = email.substring(atIndex);
  
  return `${username.charAt(0)}***${domain}`;
}

/**
 * 전화번호 마스킹 (마지막 4자리만 표시)
 * @param {string} phone - 전화번호
 * @returns {string} - 마스킹된 전화번호
 */
function maskPhone(phone) {
  if (!phone || typeof phone !== 'string') {
    return phone;
  }
  
  // 숫자만 추출
  const digits = phone.replace(/\D/g, '');
  
  if (digits.length < 4) {
    return '***';
  }
  
  const lastFour = digits.slice(-4);
  return `***-****-${lastFour}`;
}

/**
 * 민감정보 완전 제거 (CVV, 비밀번호, API 키)
 * @param {string} value - 제거할 값
 * @returns {string} - '[REDACTED]'
 */
function redactSensitive(value) {
  return '[REDACTED]';
}

/**
 * 객체 내 민감정보 마스킹
 * @param {Object} data - 마스킹할 데이터 객체
 * @returns {Object} - 마스킹된 데이터 객체
 */
function maskSensitiveData(data) {
  if (!data || typeof data !== 'object') {
    return data;
  }
  
  // 배열 처리
  if (Array.isArray(data)) {
    return data.map(item => maskSensitiveData(item));
  }
  
  // 객체 복사
  const masked = { ...data };
  
  // 민감정보 필드 목록
  const sensitiveFields = {
    // 완전 제거
    cvv: redactSensitive,
    cvc: redactSensitive,
    cvv2: redactSensitive,
    password: redactSensitive,
    api_key: redactSensitive,
    apiKey: redactSensitive,
    secret: redactSensitive,
    token: redactSensitive,
    access_token: redactSensitive,
    refresh_token: redactSensitive,
    
    // 마스킹
    card_number: maskCardNumber,
    cardNumber: maskCardNumber,
    card: maskCardNumber,
    email: maskEmail,
    phone: maskPhone,
    phone_number: maskPhone,
    phoneNumber: maskPhone,
    mobile: maskPhone
  };
  
  // 각 필드 처리
  for (const key in masked) {
    if (masked.hasOwnProperty(key)) {
      const lowerKey = key.toLowerCase();
      
      // 민감정보 필드 확인
      for (const [sensitiveKey, maskFunc] of Object.entries(sensitiveFields)) {
        if (lowerKey.includes(sensitiveKey.toLowerCase())) {
          masked[key] = maskFunc(masked[key]);
          break;
        }
      }
      
      // 중첩 객체 재귀 처리
      if (typeof masked[key] === 'object' && masked[key] !== null) {
        masked[key] = maskSensitiveData(masked[key]);
      }
    }
  }
  
  return masked;
}

/**
 * 정보 로그 (마스킹 적용)
 * @param {string} message - 로그 메시지
 * @param {Object} data - 로그 데이터
 */
function logInfo(message, data = null) {
  const timestamp = new Date().toISOString();
  const maskedData = data ? maskSensitiveData(data) : null;
  
  console.log(JSON.stringify({
    level: 'INFO',
    timestamp,
    message,
    data: maskedData
  }));
}

/**
 * 에러 로그 (마스킹 적용)
 * @param {string} message - 에러 메시지
 * @param {Error} error - 에러 객체
 * @param {Object} data - 추가 데이터
 */
function logError(message, error = null, data = null) {
  const timestamp = new Date().toISOString();
  const maskedData = data ? maskSensitiveData(data) : null;
  
  // 스택 트레이스에서 민감정보 제거
  let stack = null;
  if (error && error.stack) {
    stack = error.stack;
    // 환경 변수나 민감정보가 포함될 수 있는 패턴 제거
    stack = stack.replace(/password[=:]\s*[^\s,}]+/gi, 'password=[REDACTED]');
    stack = stack.replace(/api[_-]?key[=:]\s*[^\s,}]+/gi, 'api_key=[REDACTED]');
  }
  
  console.error(JSON.stringify({
    level: 'ERROR',
    timestamp,
    message,
    error: error ? {
      name: error.name,
      message: error.message,
      stack
    } : null,
    data: maskedData
  }));
}

/**
 * 결제 로그 (특별 마스킹)
 * @param {Object} paymentData - 결제 데이터
 */
function logPayment(paymentData) {
  const timestamp = new Date().toISOString();
  
  // 결제 데이터 특별 처리
  const maskedPayment = maskSensitiveData(paymentData);
  
  // 추가 마스킹: transaction_id의 일부만 표시
  if (maskedPayment.transaction_id && typeof maskedPayment.transaction_id === 'string') {
    const txId = maskedPayment.transaction_id;
    if (txId.length > 8) {
      maskedPayment.transaction_id = `${txId.substring(0, 4)}...${txId.substring(txId.length - 4)}`;
    }
  }
  
  console.log(JSON.stringify({
    level: 'PAYMENT',
    timestamp,
    message: 'Payment processed',
    payment: maskedPayment
  }));
}

/**
 * 디버그 로그 (개발 환경에서만)
 * @param {string} message - 디버그 메시지
 * @param {Object} data - 디버그 데이터
 */
function logDebug(message, data = null) {
  if (process.env.NODE_ENV === 'development') {
    const timestamp = new Date().toISOString();
    const maskedData = data ? maskSensitiveData(data) : null;
    
    console.log(JSON.stringify({
      level: 'DEBUG',
      timestamp,
      message,
      data: maskedData
    }));
  }
}

export {
  maskCardNumber,
  maskEmail,
  maskPhone,
  redactSensitive,
  maskSensitiveData,
  logInfo,
  logError,
  logPayment,
  logDebug
};
