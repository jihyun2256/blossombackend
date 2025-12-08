/**
 * 검증 미들웨어
 * 입력 값 검증 미들웨어
 * 요구사항: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6
 */

import {
  isValidUserId,
  isValidAmount,
  isValidPaymentMethod,
  isValidIdempotencyKey,
  detectSQLInjection,
  sanitizeInput,
  isValidLength,
  isValidOrderItems
} from '../utils/validator.js';
import { logError } from '../utils/logger.js';

/**
 * 주문 생성 요청 검증 미들웨어
 * 요구사항: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6
 */
function validateOrderCreation(req, res, next) {
  try {
    const { user_id, items, total_price } = req.body;

    // 필수 필드 존재 여부 확인
    if (!user_id) {
      return res.status(400).json({
        success: false,
        message: 'user_id is required',
        error_code: 'VALIDATION_ERROR'
      });
    }

    if (!items) {
      return res.status(400).json({
        success: false,
        message: 'items is required',
        error_code: 'VALIDATION_ERROR'
      });
    }

    if (!total_price) {
      return res.status(400).json({
        success: false,
        message: 'total_price is required',
        error_code: 'VALIDATION_ERROR'
      });
    }

    // user_id 검증
    if (!isValidUserId(user_id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user_id: must be a positive integer',
        error_code: 'VALIDATION_ERROR'
      });
    }

    // items 배열 검증
    if (!isValidOrderItems(items)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid items: must be a non-empty array with valid product_id, quantity, and price',
        error_code: 'VALIDATION_ERROR'
      });
    }

    // total_price 검증
    if (!isValidAmount(total_price)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid total_price: must be a positive number between 0.01 and 10,000,000',
        error_code: 'VALIDATION_ERROR'
      });
    }

    // SQL Injection 패턴 감지 (문자열 필드)
    const stringFields = [];
    items.forEach((item, index) => {
      if (item.name && typeof item.name === 'string') {
        stringFields.push({ field: `items[${index}].name`, value: item.name });
      }
    });

    for (const { field, value } of stringFields) {
      if (detectSQLInjection(value)) {
        logError('SQL Injection attempt detected', null, {
          field,
          value: value.substring(0, 50)
        });
        return res.status(400).json({
          success: false,
          message: 'Invalid input: potentially malicious content detected',
          error_code: 'VALIDATION_ERROR'
        });
      }
    }

    // 검증 통과
    next();
  } catch (error) {
    logError('Validation error in validateOrderCreation', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error during validation',
      error_code: 'VALIDATION_ERROR'
    });
  }
}

/**
 * 결제 요청 검증 미들웨어
 * 요구사항: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6
 */
function validatePaymentRequest(req, res, next) {
  try {
    const { order_id, payment_method, idempotency_key } = req.body;

    // 필수 필드 존재 여부 확인
    if (!order_id) {
      return res.status(400).json({
        success: false,
        message: 'order_id is required',
        error_code: 'VALIDATION_ERROR'
      });
    }

    if (!payment_method) {
      return res.status(400).json({
        success: false,
        message: 'payment_method is required',
        error_code: 'VALIDATION_ERROR'
      });
    }

    if (!idempotency_key) {
      return res.status(400).json({
        success: false,
        message: 'idempotency_key is required',
        error_code: 'VALIDATION_ERROR'
      });
    }

    // order_id 검증
    if (!isValidUserId(order_id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid order_id: must be a positive integer',
        error_code: 'VALIDATION_ERROR'
      });
    }

    // payment_method 검증
    if (!isValidPaymentMethod(payment_method)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment_method: must be one of card, credit_card, debit_card, bank_transfer, mobile, or paypal',
        error_code: 'VALIDATION_ERROR'
      });
    }

    // idempotency_key 검증
    if (!isValidIdempotencyKey(idempotency_key)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid idempotency_key: must be a valid UUID v4',
        error_code: 'VALIDATION_ERROR'
      });
    }

    // SQL Injection 패턴 감지
    if (detectSQLInjection(payment_method)) {
      logError('SQL Injection attempt detected', null, {
        field: 'payment_method',
        value: payment_method
      });
      return res.status(400).json({
        success: false,
        message: 'Invalid input: potentially malicious content detected',
        error_code: 'VALIDATION_ERROR'
      });
    }

    // 검증 통과
    next();
  } catch (error) {
    logError('Validation error in validatePaymentRequest', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error during validation',
      error_code: 'VALIDATION_ERROR'
    });
  }
}

/**
 * 취소 요청 검증 미들웨어
 * 요구사항: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6
 */
function validateCancellationRequest(req, res, next) {
  try {
    const { payment_id } = req.params;
    const { reason } = req.body;

    // payment_id 검증 (URL 파라미터)
    if (!payment_id) {
      return res.status(400).json({
        success: false,
        message: 'payment_id is required',
        error_code: 'VALIDATION_ERROR'
      });
    }

    // payment_id 형식 검증 (문자열 길이)
    if (!isValidLength(payment_id, 100)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment_id: must be between 1 and 100 characters',
        error_code: 'VALIDATION_ERROR'
      });
    }

    // SQL Injection 패턴 감지
    if (detectSQLInjection(payment_id)) {
      logError('SQL Injection attempt detected', null, {
        field: 'payment_id',
        value: payment_id
      });
      return res.status(400).json({
        success: false,
        message: 'Invalid input: potentially malicious content detected',
        error_code: 'VALIDATION_ERROR'
      });
    }

    // reason 검증 (선택적 필드)
    if (reason) {
      if (typeof reason !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'Invalid reason: must be a string',
          error_code: 'VALIDATION_ERROR'
        });
      }

      if (!isValidLength(reason, 500)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid reason: must be between 1 and 500 characters',
          error_code: 'VALIDATION_ERROR'
        });
      }

      // SQL Injection 패턴 감지
      if (detectSQLInjection(reason)) {
        logError('SQL Injection attempt detected', null, {
          field: 'reason',
          value: reason.substring(0, 50)
        });
        return res.status(400).json({
          success: false,
          message: 'Invalid input: potentially malicious content detected',
          error_code: 'VALIDATION_ERROR'
        });
      }

      // reason 정제
      req.body.reason = sanitizeInput(reason);
    }

    // 검증 통과
    next();
  } catch (error) {
    logError('Validation error in validateCancellationRequest', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error during validation',
      error_code: 'VALIDATION_ERROR'
    });
  }
}

export {
  validateOrderCreation,
  validatePaymentRequest,
  validateCancellationRequest
};
