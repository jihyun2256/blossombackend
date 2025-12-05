/**
 * 암호화 유틸리티
 * AES-256 암호화/복호화 및 해싱
 * 요구사항: 11.2, 11.5
 */

import crypto from 'crypto';

// 환경 변수에서 암호화 키 로드
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const ENCRYPTION_IV = process.env.ENCRYPTION_IV;

// 암호화 알고리즘
const ALGORITHM = 'aes-256-cbc';

/**
 * 암호화 키 검증
 * @throws {Error} - 키가 설정되지 않은 경우
 */
function validateEncryptionKeys() {
  if (!ENCRYPTION_KEY || !ENCRYPTION_IV) {
    throw new Error('Encryption keys not configured. Set ENCRYPTION_KEY and ENCRYPTION_IV environment variables.');
  }
  
  // 키 길이 검증 (AES-256은 32바이트 키 필요)
  if (ENCRYPTION_KEY.length !== 32) {
    throw new Error('ENCRYPTION_KEY must be 32 characters long for AES-256.');
  }
  
  // IV 길이 검증 (16바이트)
  if (ENCRYPTION_IV.length !== 16) {
    throw new Error('ENCRYPTION_IV must be 16 characters long.');
  }
}

/**
 * AES-256 암호화
 * @param {string} text - 암호화할 텍스트
 * @returns {string} - 암호화된 텍스트 (hex 형식)
 */
function encrypt(text) {
  if (!text) {
    return text;
  }
  
  try {
    validateEncryptionKeys();
    
    const cipher = crypto.createCipheriv(
      ALGORITHM,
      Buffer.from(ENCRYPTION_KEY, 'utf8'),
      Buffer.from(ENCRYPTION_IV, 'utf8')
    );
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return encrypted;
  } catch (error) {
    console.error('Encryption error:', error.message);
    throw new Error('Failed to encrypt data');
  }
}

/**
 * AES-256 복호화
 * @param {string} encryptedText - 복호화할 텍스트 (hex 형식)
 * @returns {string} - 복호화된 텍스트
 */
function decrypt(encryptedText) {
  if (!encryptedText) {
    return encryptedText;
  }
  
  try {
    validateEncryptionKeys();
    
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      Buffer.from(ENCRYPTION_KEY, 'utf8'),
      Buffer.from(ENCRYPTION_IV, 'utf8')
    );
    
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error.message);
    throw new Error('Failed to decrypt data');
  }
}

/**
 * Idempotency 키 해싱 (SHA-256)
 * @param {string} key - 해싱할 Idempotency 키
 * @returns {string} - 해시된 키 (hex 형식)
 */
function hashIdempotencyKey(key) {
  if (!key) {
    throw new Error('Idempotency key is required for hashing');
  }
  
  try {
    const hash = crypto.createHash('sha256');
    hash.update(key);
    return hash.digest('hex');
  } catch (error) {
    console.error('Hashing error:', error.message);
    throw new Error('Failed to hash idempotency key');
  }
}

/**
 * 요청 데이터 해싱 (중복 요청 감지용)
 * @param {Object} requestData - 해싱할 요청 데이터
 * @returns {string} - 해시된 요청 데이터 (hex 형식)
 */
function hashRequestData(requestData) {
  if (!requestData) {
    throw new Error('Request data is required for hashing');
  }
  
  try {
    const hash = crypto.createHash('sha256');
    hash.update(JSON.stringify(requestData));
    return hash.digest('hex');
  } catch (error) {
    console.error('Request hashing error:', error.message);
    throw new Error('Failed to hash request data');
  }
}

/**
 * 랜덤 토큰 생성
 * @param {number} length - 토큰 길이 (바이트)
 * @returns {string} - 랜덤 토큰 (hex 형식)
 */
function generateRandomToken(length = 32) {
  try {
    return crypto.randomBytes(length).toString('hex');
  } catch (error) {
    console.error('Token generation error:', error.message);
    throw new Error('Failed to generate random token');
  }
}

/**
 * 비밀번호 해싱 (bcrypt 스타일 - SHA-256 + salt)
 * @param {string} password - 해싱할 비밀번호
 * @param {string} salt - Salt (선택사항, 없으면 자동 생성)
 * @returns {Object} - { hash, salt }
 */
function hashPassword(password, salt = null) {
  if (!password) {
    throw new Error('Password is required for hashing');
  }
  
  try {
    // Salt 생성 또는 사용
    const useSalt = salt || crypto.randomBytes(16).toString('hex');
    
    // PBKDF2를 사용한 강력한 해싱
    const hash = crypto.pbkdf2Sync(password, useSalt, 10000, 64, 'sha256').toString('hex');
    
    return {
      hash,
      salt: useSalt
    };
  } catch (error) {
    console.error('Password hashing error:', error.message);
    throw new Error('Failed to hash password');
  }
}

/**
 * 비밀번호 검증
 * @param {string} password - 검증할 비밀번호
 * @param {string} hash - 저장된 해시
 * @param {string} salt - 저장된 salt
 * @returns {boolean} - 일치 여부
 */
function verifyPassword(password, hash, salt) {
  if (!password || !hash || !salt) {
    return false;
  }
  
  try {
    const { hash: newHash } = hashPassword(password, salt);
    return newHash === hash;
  } catch (error) {
    console.error('Password verification error:', error.message);
    return false;
  }
}

export {
  encrypt,
  decrypt,
  hashIdempotencyKey,
  hashRequestData,
  generateRandomToken,
  hashPassword,
  verifyPassword,
  validateEncryptionKeys
};
