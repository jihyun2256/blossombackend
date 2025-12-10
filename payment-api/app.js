/**
 * 결제 API - 메인 애플리케이션
 * Express 앱 진입점
 * 요구사항: 11.1
 */

import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import { db } from '../shared/db.js';
import { authenticate } from '../shared/auth.js';
import { logError, maskSensitiveData } from './utils/logger.js';
import { initRedis } from './config/redis.js';

// 라우트
import paymentsRouter from './routes/payments.js';

// 환경 변수 로드
dotenv.config();

const app = express();

// Redis 초기화 (비동기, 실패해도 앱은 계속 동작)
initRedis();

// 1️⃣ CORS 미들웨어 (기본 허용)
app.use(cors({
  origin: '*',   // S3 도메인 포함 전체 허용
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
  allowedHeaders: 'Content-Type, Authorization'
}));

// 3️⃣ 모든 응답에 CORS 헤더 강제 추가 (ALB 환경에서 매우 중요)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
});

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 요청 로깅 미들웨어 (민감정보 마스킹 적용)
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  const maskedBody = maskSensitiveData(req.body);
  
  console.log(JSON.stringify({
    level: 'INFO',
    timestamp,
    method: req.method,
    path: req.path,
    body: maskedBody,
    ip: req.ip
  }));
  
  next();
});

// 헬스 체크 엔드포인트
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    service: 'payment-api',
    timestamp: new Date().toISOString()
  });
});

app.get('/readiness', async (req, res) => {
  try {
    // 데이터베이스 연결 확인
    await db.query('SELECT 1');
    res.json({ 
      ready: true, 
      database: 'connected',
      service: 'payment-api',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logError('Readiness check failed', error);
    res.status(503).json({ 
      ready: false, 
      database: 'disconnected',
      service: 'payment-api',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// 라우트 연결
// 결제 처리 엔드포인트 (인증 필요)
app.use('/payments', authenticate, paymentsRouter);

// 404 핸들러
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found',
    error_code: 'NOT_FOUND',
    path: req.path
  });
});

// 전역 에러 핸들러 (민감정보 마스킹)
app.use((err, req, res, next) => {
  // 에러 로깅 (민감정보 마스킹 적용)
  logError('Unhandled error in payment-api', err, {
    method: req.method,
    path: req.path,
    body: req.body,
    params: req.params,
    query: req.query
  });
  
  // 에러 응답 준비
  const errorResponse = {
    success: false,
    message: 'Internal server error',
    error_code: 'INTERNAL_SERVER_ERROR'
  };
  
  // 개발 환경에서만 상세 에러 정보 포함
  if (process.env.NODE_ENV !== 'production') {
    errorResponse.error = err.message;
    errorResponse.stack = err.stack;
  }
  
  // 에러 타입에 따른 상태 코드 결정
  const statusCode = err.status || err.statusCode || 500;
  
  res.status(statusCode).json(errorResponse);
});

// 서버 시작
const PORT = process.env.PORT || 3005;
const server = app.listen(PORT, () => {
  console.log(`✅ payment-api listening on port ${PORT}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔒 HTTPS enforcement: ${process.env.ENFORCE_HTTPS === 'true' ? 'enabled' : 'disabled'}`);
});

// 우아한 종료 (Graceful shutdown)
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

export default app;
