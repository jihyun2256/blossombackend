import express from "express";
import bcryptjs from "bcryptjs";
import { db } from "../../shared/db.js";
import { generateToken } from "../../shared/auth.js";
import redisClient, { initRedis } from "../config/redis.js";

// Redis 연결 보장
await initRedis();

const router = express.Router();

router.post("/register", async (req, res) => {
    try {
        const { name, email, password, phone } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ success: false, message: "MISSING_FIELDS", error: "이름, 이메일, 비밀번호는 필수입니다" });
        }

        const [exists] = await db.query("SELECT user_id FROM users WHERE email = ?", [email]);
        if (exists.length > 0) {
            return res.status(409).json({ success: false, message: "EMAIL_ALREADY_EXISTS", error: "이미 사용 중인 이메일입니다" });
        }

        const password_hash = await bcryptjs.hash(password, 10);

        const [result] = await db.query(
            `INSERT INTO users (email, password_hash, name, phone, role, is_active, email_verified)
             VALUES (?, ?, ?, ?, 'customer', TRUE, FALSE)`,
            [email, password_hash, name, phone || null]
        );
        // Cache delete: 유저가 새로 생성되었으므로 전체 유저 목록 캐시 무효화
        try {
            // Cache delete: users:all
            const cacheKey = "users:all";
            await redisClient.del(cacheKey);
            console.log(`CACHE DELETE (${cacheKey})`);
        } catch (redisErr) {
            console.error("Redis DEL error (users:all):", redisErr);
        }

        return res.status(201).json({ success: true, message: "REGISTERED_SUCCESSFULLY", user: { user_id: result.insertId, email, name, role: 'customer' } });
    } catch (err) {
        console.error("REGISTER ERROR:", err);
        return res.status(500).json({ success: false, message: "SERVER_ERROR", error: err.message });
    }
});

router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ success: false, message: "MISSING_FIELDS" });
        const [rows] = await db.query("SELECT user_id, email, name, password_hash, role, is_active FROM users WHERE email = ?", [email]);
        if (rows.length === 0) return res.status(404).json({ success: false, message: "USER_NOT_FOUND" });
        const user = rows[0];
        if (!user.is_active) return res.status(403).json({ success: false, message: "ACCOUNT_INACTIVE" });
        const isMatch = await bcryptjs.compare(password, user.password_hash);
        if (!isMatch) {
            // 로그인 실패 횟수 Redis에 저장 (Rate Limit 예시)
            try {
                const ip = req.ip || req.connection?.remoteAddress || "unknown";
                const key = `login_attempt:${ip}`;
                const count = await redisClient.incr(key);
                // 5분 TTL 설정
                if (count === 1) {
                    await redisClient.expire(key, 300);
                }
            } catch (redisErr) {
                console.error("Redis error on login attempt tracking:", redisErr);
            }
            return res.status(401).json({ success: false, message: "INVALID_PASSWORD" });
        }
        await db.query("UPDATE users SET last_login = NOW() WHERE user_id = ?", [user.user_id]);

        // 예: 로그인 Refresh Token 저장 (Redis)
        try {
            const refreshTokenKey = `refresh:${user.user_id}`;
            const refreshToken = generateToken(user, { type: "refresh" });
            await redisClient.set(refreshTokenKey, refreshToken, { EX: 60 * 60 * 24 * 7 }); // 7일 TTL
        } catch (redisErr) {
            console.error("Redis error on refresh token store:", redisErr);
        }
        
        // JWT 토큰 생성 (동적 데이터 포함)
        const token = generateToken(user, {
            loginTime: new Date().toISOString(), // 로그인 시간
            ipAddress: req.ip || req.connection?.remoteAddress, // IP 주소
            userAgent: req.headers['user-agent'], // 브라우저 정보
            deviceId: req.headers['x-device-id'] || 'unknown', // 디바이스 ID (클라이언트에서 전송)
            // 필요한 다른 동적 데이터 추가 가능
        });
        
        return res.status(200).json({ 
            success: true, 
            message: "LOGIN_SUCCESS", 
            token: token,
            user: { 
                user_id: user.user_id, 
                email: user.email, 
                name: user.name, 
                role: user.role 
            } 
        });
    } catch (err) {
        console.error("LOGIN ERROR:", err);
        return res.status(500).json({ success: false, message: "SERVER_ERROR", error: err.message });
    }
});

router.get("/", async (req, res) => {
    try {
        const cacheKey = "users:all";

        // Cache get: 전체 유저 목록 캐시 확인
        try {
            const cached = await redisClient.get(cacheKey);
            if (cached) {
                console.log(`CACHE HIT (${cacheKey})`);
                // Cache hit: 캐싱된 전체 응답 반환
                return res.json(JSON.parse(cached));
            }
            console.log(`CACHE MISS (${cacheKey})`);
        } catch (redisErr) {
            console.error(`Redis GET error (${cacheKey}):`, redisErr);
        }

        // Cache miss: DB에서 유저 목록 조회
        const [rows] = await db.query(`SELECT user_id, email, name, phone, role, is_active, email_verified, created_at, last_login FROM users ORDER BY created_at DESC`);
        const result = { success: true, users: rows };

        // Cache set: 조회 결과를 Redis에 캐싱 (TTL = 60초)
        try {
            await redisClient.set(cacheKey, JSON.stringify(result), { EX: 60 });
            console.log(`CACHE SET (${cacheKey})`);
        } catch (redisErr) {
            console.error(`Redis SET error (${cacheKey}):`, redisErr);
        }

        return res.json(result);
    } catch (err) {
        console.error("GET USERS ERROR:", err);
        return res.status(500).json({ success: false, message: "SERVER_ERROR", error: err.message });
    }
});

router.get("/:userId", async (req, res) => {
    try {
        const { userId } = req.params;
        const cacheKey = `users:${userId}`;

        // Cache get: 특정 유저 캐시 확인
        try {
            const cached = await redisClient.get(cacheKey);
            if (cached) {
                console.log(`CACHE HIT (${cacheKey})`);
                // Cache hit: 캐싱된 전체 응답 반환
                return res.json(JSON.parse(cached));
            }
            console.log(`CACHE MISS (${cacheKey})`);
        } catch (redisErr) {
            console.error(`Redis GET error (${cacheKey}):`, redisErr);
        }

        // Cache miss: DB에서 유저 조회
        const [rows] = await db.query(`SELECT user_id, email, name, phone, role, is_active, email_verified, created_at, last_login FROM users WHERE user_id = ?`, [userId]);
        if (rows.length === 0) return res.status(404).json({ success: false, message: "USER_NOT_FOUND" });

        const user = rows[0];
        const result = { success: true, user };

        // Cache set: 단건 유저 정보를 Redis에 캐싱 (TTL = 300초)
        try {
            await redisClient.set(cacheKey, JSON.stringify(result), { EX: 300 });
            console.log(`CACHE SET (${cacheKey})`);
        } catch (redisErr) {
            console.error(`Redis SET error (${cacheKey}):`, redisErr);
        }

        return res.json(result);
    } catch (err) {
        console.error("GET USER ERROR:", err);
        return res.status(500).json({ success: false, message: "SERVER_ERROR", error: err.message });
    }
});

export default router;
