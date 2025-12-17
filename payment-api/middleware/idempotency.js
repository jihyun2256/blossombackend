/**
 * Idempotency 미들웨어
 * 중복 요청 방지 미들웨어
 * 요구사항: 9.1, 9.2, 9.3
 */

import {
  checkIdempotencyKey,
  getIdempotencyResult,
  validateRequestData,
  storeIdempotencyKey
} from '../services/idempotencyService.js';
import { logInfo, logError } from '../utils/logger.js';

/**
 * Idempotency 체크 미들웨어
 * 중복 요청 시 캐시된 응답 반환, 새 요청 시 다음 핸들러로 진행
 * 요구사항: 9.1, 9.2, 9.3
 */
async function checkIdempotency(req, res, next) {
  try {
    const { idempotency_key } = req.body;

    // idempotency_key가 없으면 다음 핸들러로 진행
    // (validation 미들웨어에서 이미 검증됨)
    if (!idempotency_key) {
      return next();
    }

    // Idempotency key 존재 여부 확인
    const exists = await checkIdempotencyKey(idempotency_key);

    if (!exists) {
      // 새 요청 - 다음 핸들러로 진행
      logInfo('New request with idempotency key', {
        idempotency_key
      });
      return next();
    }

    // 중복 요청 - 요청 데이터 검증
    const requestData = {
      order_id: req.body.order_id,
      payment_method: req.body.payment_method,
      user_id: req.body.user_id,
      items: req.body.items,
      total_price: req.body.total_price
    };

    const isValidRequest = await validateRequestData(idempotency_key, requestData);

    if (!isValidRequest) {
      // 동일한 키로 다른 요청 데이터 사용 시 에러
      logError('Idempotency key conflict', null, {
        idempotency_key,
        message: 'Same key used with different request data'
      });
      return res.status(409).json({
        success: false,
        message: 'Idempotency key conflict: same key used with different request data',
        error_code: 'DUPLICATE_REQUEST'
      });
    }

    // 캐시된 결과 조회
    const cachedResult = await getIdempotencyResult(idempotency_key);

    if (cachedResult) {
      // 캐시된 응답 반환
      logInfo('Returning cached response for duplicate request', {
        idempotency_key
      });
      return res.status(200).json(cachedResult);
    }

    // 캐시된 결과가 없으면 다음 핸들러로 진행
    // (키는 존재하지만 응답이 아직 저장되지 않은 경우)
    logInfo('Idempotency key exists but no cached result', {
      idempotency_key
    });
    return next();

  } catch (error) {
    // 에러 발생 시 로그 기록 후 다음 핸들러로 진행
    // (Idempotency 체크 실패가 전체 요청을 막지 않도록)
    logError('Error in idempotency middleware', error, {
      idempotency_key: req.body.idempotency_key
    });
    
    // 에러가 발생해도 요청은 계속 진행
    return next();
  }
}

/**
 * Idempotency 응답 저장 헬퍼 함수
 * 라우트 핸들러에서 사용하여 응답을 캐시에 저장
 * @param {string} idempotencyKey - Idempotency 키
 * @param {Object} requestData - 요청 데이터
 * @param {Object} responseData - 응답 데이터
 */
async function storeIdempotencyResponse(idempotencyKey, requestData, responseData) {
  try {
    await storeIdempotencyKey(idempotencyKey, requestData, responseData);
    
    logInfo('Idempotency response stored', {
      idempotency_key: idempotencyKey
    });
  } catch (error) {
    // 저장 실패는 로그만 기록 (응답 전송에는 영향 없음)
    logError('Failed to store idempotency response', error, {
      idempotency_key: idempotencyKey
    });
  }
}

export {
  checkIdempotency,
  storeIdempotencyResponse
};
