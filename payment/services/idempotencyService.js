/**
 * Idempotency 서비스
 * 중복 결제 방지 로직
 * 요구사항: 9.1, 9.2, 9.3, 9.4, 9.5
 */

import { db } from '../../shared/db.js';
import { logInfo, logError } from '../utils/logger.js';
import { hashRequestData } from '../utils/encryption.js';

/**
 * Idempotency 키 존재 여부 확인
 * @param {string} key - Idempotency 키
 * @returns {Promise<boolean>} - 존재 여부
 */
async function checkIdempotencyKey(key) {
  try {
    if (!key || typeof key !== 'string') {
      throw new Error('Invalid idempotency_key');
    }

    // 만료되지 않은 키 조회 (parameterized query)
    const [results] = await db.execute(
      'SELECT id FROM idempotency_keys WHERE idempotency_key = ? AND expires_at > NOW()',
      [key]
    );

    const exists = results.length > 0;

    logInfo('Idempotency key checked', {
      key,
      exists
    });

    return exists;
  } catch (error) {
    logError('Failed to check idempotency key', error, { key });
    throw error;
  }
}

/**
 * Idempotency 키 및 응답 저장
 * @param {string} key - Idempotency 키
 * @param {Object} requestData - 요청 데이터
 * @param {Object} response - 응답 데이터
 * @returns {Promise<void>}
 */
async function storeIdempotencyKey(key, requestData, response) {
  try {
    if (!key || typeof key !== 'string') {
      throw new Error('Invalid idempotency_key');
    }

    if (!requestData || typeof requestData !== 'object') {
      throw new Error('Invalid request data');
    }

    if (!response || typeof response !== 'object') {
      throw new Error('Invalid response data');
    }

    // 요청 데이터 해싱
    const requestHash = hashRequestData(requestData);

    // 응답 데이터 JSON 직렬화
    const responseData = JSON.stringify(response);

    // 만료 시간 설정 (24시간 후)
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    // Idempotency key 저장 (parameterized query)
    await db.execute(
      `INSERT INTO idempotency_keys 
       (idempotency_key, request_hash, response_data, expires_at) 
       VALUES (?, ?, ?, ?)`,
      [key, requestHash, responseData, expiresAt]
    );

    logInfo('Idempotency key stored', {
      key,
      expires_at: expiresAt
    });
  } catch (error) {
    // 중복 키 에러는 무시 (이미 저장된 경우)
    if (error.code === 'ER_DUP_ENTRY') {
      logInfo('Idempotency key already exists', { key });
      return;
    }

    logError('Failed to store idempotency key', error, { key });
    throw error;
  }
}

/**
 * 캐시된 결과 조회
 * @param {string} key - Idempotency 키
 * @returns {Promise<Object|null>} - 캐시된 응답 데이터 또는 null
 */
async function getIdempotencyResult(key) {
  try {
    if (!key || typeof key !== 'string') {
      throw new Error('Invalid idempotency_key');
    }

    // 만료되지 않은 키의 응답 조회 (parameterized query)
    const [results] = await db.execute(
      `SELECT response_data, expires_at 
       FROM idempotency_keys 
       WHERE idempotency_key = ? AND expires_at > NOW()`,
      [key]
    );

    if (results.length === 0) {
      logInfo('Idempotency key not found or expired', { key });
      return null;
    }

    const result = results[0];

    // JSON 파싱
    const responseData = JSON.parse(result.response_data);

    logInfo('Idempotency result retrieved', {
      key,
      expires_at: result.expires_at
    });

    return responseData;
  } catch (error) {
    logError('Failed to get idempotency result', error, { key });
    throw error;
  }
}

/**
 * 만료된 키 정리 (24시간 이상 된 키)
 * @returns {Promise<number>} - 삭제된 키 개수
 */
async function cleanupExpiredKeys() {
  try {
    // 만료된 키 삭제
    const [result] = await db.execute(
      'DELETE FROM idempotency_keys WHERE expires_at <= NOW()'
    );

    const deletedCount = result.affectedRows;

    logInfo('Expired idempotency keys cleaned up', {
      deleted_count: deletedCount
    });

    return deletedCount;
  } catch (error) {
    logError('Failed to cleanup expired keys', error);
    throw error;
  }
}

/**
 * 특정 키 삭제 (테스트용)
 * @param {string} key - Idempotency 키
 * @returns {Promise<void>}
 */
async function deleteIdempotencyKey(key) {
  try {
    if (!key || typeof key !== 'string') {
      throw new Error('Invalid idempotency_key');
    }

    // 키 삭제 (parameterized query)
    const [result] = await db.execute(
      'DELETE FROM idempotency_keys WHERE idempotency_key = ?',
      [key]
    );

    logInfo('Idempotency key deleted', {
      key,
      deleted: result.affectedRows > 0
    });
  } catch (error) {
    logError('Failed to delete idempotency key', error, { key });
    throw error;
  }
}

/**
 * 요청 데이터 검증 (중복 요청 감지)
 * @param {string} key - Idempotency 키
 * @param {Object} requestData - 현재 요청 데이터
 * @returns {Promise<boolean>} - 동일한 요청인지 여부
 */
async function validateRequestData(key, requestData) {
  try {
    if (!key || typeof key !== 'string') {
      throw new Error('Invalid idempotency_key');
    }

    if (!requestData || typeof requestData !== 'object') {
      throw new Error('Invalid request data');
    }

    // 현재 요청 데이터 해싱
    const currentHash = hashRequestData(requestData);

    // 저장된 요청 해시 조회 (parameterized query)
    const [results] = await db.execute(
      `SELECT request_hash 
       FROM idempotency_keys 
       WHERE idempotency_key = ? AND expires_at > NOW()`,
      [key]
    );

    if (results.length === 0) {
      // 키가 없으면 새 요청
      return true;
    }

    const storedHash = results[0].request_hash;

    // 해시 비교
    const isValid = currentHash === storedHash;

    if (!isValid) {
      logError('Request data mismatch for idempotency key', null, {
        key,
        message: 'Same key used with different request data'
      });
    }

    return isValid;
  } catch (error) {
    logError('Failed to validate request data', error, { key });
    throw error;
  }
}

export {
  checkIdempotencyKey,
  storeIdempotencyKey,
  getIdempotencyResult,
  cleanupExpiredKeys,
  deleteIdempotencyKey,
  validateRequestData
};
