import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import lexRouter from './routes/lex.js';

dotenv.config();

const app = express();

console.log('🚀 Lex API 서버 시작 중...');
console.log('📍 환경:', process.env.NODE_ENV || 'development');
console.log('🌏 리전:', process.env.AWS_REGION || 'ap-northeast-2');

// 1️⃣ CORS 미들웨어 (기본 허용)
app.use(cors({
  origin: "*",   // 프로덕션에서는 실제 도메인으로 제한
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS",
  allowedHeaders: "Content-Type, Authorization",
  credentials: true
}));

// 2️⃣ 모든 응답에 CORS 헤더 강제 추가 (ALB 환경에서 매우 중요)
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  
  // OPTIONS 요청 처리
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
});

// 3️⃣ Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 4️⃣ 요청 로깅 미들웨어
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
  });
  next();
});

// 5️⃣ Health check 엔드포인트
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    service: 'lex-api',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

app.get('/readiness', (req, res) => {
  // 실제 프로덕션에서는 DB 연결 등 체크
  res.json({ 
    ready: true,
    service: 'lex-api',
    timestamp: new Date().toISOString()
  });
});

// 6️⃣ 메인 라우터
app.use('/lex', lexRouter);

// 7️⃣ Root 엔드포인트
app.get('/', (req, res) => {
  res.json({
    service: 'Megapang Lex API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/health',
      readiness: '/readiness',
      chat: 'POST /lex/chat',
      recommend: 'POST /lex/recommend',
      categories: 'GET /lex/categories',
      category: 'GET /lex/category/:category',
      stats: 'GET /lex/stats',
      priceRanges: 'GET /lex/price-ranges'
    }
  });
});

// 8️⃣ 404 핸들러
app.use((req, res) => {
  res.status(404).json({ 
    success: false, 
    message: 'NOT_FOUND',
    path: req.path,
    method: req.method
  });
});

// 9️⃣ 에러 핸들러
app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err);
  
  // Lex 관련 에러
  if (err.name === 'AccessDeniedException') {
    return res.status(403).json({ 
      success: false, 
      message: 'AWS_LEX_ACCESS_DENIED',
      error: 'Lex 접근 권한이 없습니다. IAM 설정을 확인하세요.'
    });
  }
  
  if (err.name === 'ResourceNotFoundException') {
    return res.status(404).json({ 
      success: false, 
      message: 'LEX_BOT_NOT_FOUND',
      error: 'Lex 봇을 찾을 수 없습니다. 봇 ID를 확인하세요.'
    });
  }
  
  // 일반 에러
  res.status(err.status || 500).json({ 
    success: false, 
    message: err.message || 'INTERNAL_SERVER_ERROR',
    error: process.env.NODE_ENV === 'production' ? undefined : err.stack
  });
});

// 🔟 서버 시작
const PORT = process.env.PORT || 3004;
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Lex API 서버가 포트 ${PORT}에서 실행 중입니다`);
  console.log(`📡 Health check: http://localhost:${PORT}/health`);
  console.log(`🤖 Chat endpoint: http://localhost:${PORT}/lex/chat`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('⚠️ SIGTERM 신호 받음, 서버 종료 중...');
  server.close(() => {
    console.log('✅ 서버가 정상적으로 종료되었습니다');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('⚠️ SIGINT 신호 받음, 서버 종료 중...');
  server.close(() => {
    console.log('✅ 서버가 정상적으로 종료되었습니다');
    process.exit(0);
  });
});

export default app;
