import express from "express";
import bcryptjs from "bcryptjs";
import { db } from "../../shared/db.js";
import { generateToken } from "../../shared/auth.js";
import redis from "../config/redis.js";

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
                const count = await redis.incr(key);
                // 5분 TTL 설정
                if (count === 1) {
                    await redis.expire(key, 300);
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
            await redis.set(refreshTokenKey, refreshToken, { EX: 60 * 60 * 24 * 7 }); // 7일 TTL
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
        const [rows] = await db.query(`SELECT user_id, email, name, phone, role, is_active, email_verified, created_at, last_login FROM users ORDER BY created_at DESC`);
        return res.json({ success: true, users: rows });
    } catch (err) {
        console.error("GET USERS ERROR:", err);
        return res.status(500).json({ success: false, message: "SERVER_ERROR", error: err.message });
    }
});

router.get("/:userId", async (req, res) => {
    try {
        const { userId } = req.params;
        const [rows] = await db.query(`SELECT user_id, email, name, phone, role, is_active, email_verified, created_at, last_login FROM users WHERE user_id = ?`, [userId]);
        if (rows.length === 0) return res.status(404).json({ success: false, message: "USER_NOT_FOUND" });
        return res.json({ success: true, user: rows[0] });
    } catch (err) {
        console.error("GET USER ERROR:", err);
        return res.status(500).json({ success: false, message: "SERVER_ERROR", error: err.message });
    }
});

export default router;
