import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import usersRouter from './routes/users.js';
import { initRedis } from './config/redis.js';

dotenv.config();

const app = express();

// 1️⃣ CORS 미들웨어 (기본 허용)
app.use(cors({
  origin: "*",   // S3 도메인 포함 전체 허용
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS",
  allowedHeaders: "Content-Type, Authorization"
}));

// 2️⃣ Preflight(OPTIONS) 요청 처리
app.options('*', cors());

// 3️⃣ 모든 응답에 CORS 헤더 강제 추가 (ALB 환경에서 매우 중요)
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  next();
});

// JSON 파싱
app.use(express.json());

// 헬스 체크 엔드포인트
app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.get('/readiness', (req, res) => res.json({ ready: true }));

// 라우터
app.use('/users', usersRouter);

// 전역 에러 핸들러
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, message: 'INTERNAL_SERVER_ERROR', error: err.message });
});

const PORT = process.env.PORT || 3001;

// Redis 연결이 보장된 이후에만 서버가 시작되도록 처리
await initRedis();
app.listen(PORT, () => console.log(`user-api listening on ${PORT}`));
