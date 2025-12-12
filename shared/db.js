import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

// ✅ Aurora 리더 / 라이터 분리용 풀 (lazy initialization)
let writerPoolInstance = null;
let readerPoolInstance = null;

const createWriterPool = () => {
  if (!writerPoolInstance) {
    const host = process.env.DB_HOST;
    writerPoolInstance = mysql.createPool({
      host,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });
    console.log(`✅ MySQL writer pool created (host=${host})`);
  }
  return writerPoolInstance;
};

const createReaderPool = () => {
  if (!readerPoolInstance) {
    // DB_READ_HOST 가 설정되어 있으면 리더 엔드포인트로 사용,
    // 없으면 기존과 동일하게 writer 호스트를 그대로 사용 (하위 호환)
    const host = process.env.DB_READ_HOST || process.env.DB_HOST;
    readerPoolInstance = mysql.createPool({
      host,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });
    console.log(`✅ MySQL reader pool created (host=${host})`);
  }
  return readerPoolInstance;
};

// 단순 규칙으로 읽기 쿼리(SELECT ...)를 판별
const isReadQuery = (sql) => {
  if (typeof sql !== "string") return false;
  const trimmed = sql.trim().toUpperCase();
  if (!trimmed.startsWith("SELECT")) return false;
  // SELECT ... FOR UPDATE 는 라이터로 보내야 하므로 예외 처리
  return !trimmed.includes("FOR UPDATE");
};

// 기존 db 객체 - routes에서 사용
// - db.query / db.execute : SQL 을 보고 리더/라이터 풀 자동 선택
// - db.getConnection      : 항상 라이터 풀에서 커넥션 (트랜잭션용)
export const db = {
  query: async (sql, ...params) => {
    const pool = isReadQuery(sql) ? createReaderPool() : createWriterPool();
    return pool.query(sql, ...params);
  },
  execute: async (sql, ...params) => {
    const pool = isReadQuery(sql) ? createReaderPool() : createWriterPool();
    return pool.execute(sql, ...params);
  },
  getConnection: async () => {
    const pool = createWriterPool();
    return pool.getConnection();
  },
  // 풀 직접 접근 (필요한 경우)
  get pool() {
    return createWriterPool();
  },
  get writerPool() {
    return createWriterPool();
  },
  get readerPool() {
    return createReaderPool();
  },
};

// 편의 함수 (기존 호환용): writer 풀 반환
export const getDbPool = () => createWriterPool();
