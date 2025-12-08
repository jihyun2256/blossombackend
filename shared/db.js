import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

// ✅ Top-level await 제거 - Lazy initialization
let poolInstance = null;

const createPool = () => {
  if (!poolInstance) {
    poolInstance = mysql.createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });
    console.log('✅ MySQL connection pool created');
  }
  return poolInstance;
};

// 기존 db 객체 - routes에서 사용
export const db = {
  query: async (...args) => {
    const pool = createPool();
    return pool.query(...args);
  },
  execute: async (...args) => {
    const pool = createPool();
    return pool.execute(...args);
  },
  getConnection: async () => {
    const pool = createPool();
    return pool.getConnection();
  },
  // pool 직접 접근 (필요한 경우)
  get pool() {
    return createPool();
  }
};

// 편의 함수
export const getDbPool = () => createPool();
