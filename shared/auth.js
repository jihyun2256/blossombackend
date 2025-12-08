import jwt from 'jsonwebtoken';
import { db } from './db.js';  // 같은 shared 폴더 내

/**
 * JWT 토큰 생성 (동적 데이터 포함)
 * @param {Object} user - 사용자 정보
 * @param {Object} additionalData - 추가할 동적 데이터 (선택사항)
 */
export const generateToken = (user, additionalData = {}) => {
  // 기본 페이로드
  const payload = {
    userId: user.user_id,
    email: user.email,
    role: user.role,
    // 동적 데이터 추가
    timestamp: Date.now(), // 토큰 생성 시간
    sessionId: Math.random().toString(36).substring(7), // 세션 ID
    ...additionalData // 추가 동적 데이터
  };

  return jwt.sign(
    payload,
    process.env.JWT_SECRET || 'your-secret-key-change-in-production',
    {
      expiresIn: '24h'
    }
  )
};

/**
 * JWT 토큰 검증 미들웨어
 */
export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: '인증 토큰이 필요합니다.',
      });
    }

    const token = authHeader.substring(7);

    // 토큰 검증
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'your-secret-key-change-in-production'
    );

    // 사용자 정보 조회
    const [users] = await db.query(
      'SELECT user_id, email, name, role, is_active FROM users WHERE user_id = ?',
      [decoded.userId]
    );

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: '유효하지 않은 사용자입니다.',
      });
    }

    const user = users[0];

    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: '비활성화된 계정입니다.',
      });
    }

    // 요청 객체에 사용자 정보 추가
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: '토큰이 만료되었습니다.',
      });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: '유효하지 않은 토큰입니다.',
      });
    }
    return res.status(500).json({
      success: false,
      message: '인증 처리 중 오류가 발생했습니다.',
      error: error.message,
    });
  }
};

/**
 * 역할 기반 권한 체크 미들웨어
 * @param {Array<string>} allowedRoles - 허용된 역할 목록
 */
export const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: '인증이 필요합니다.',
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: '이 작업을 수행할 권한이 없습니다.',
        requiredRoles: allowedRoles,
        userRole: req.user.role,
      });
    }

    next();
  };
};

/**
 * 세부 권한 체크 미들웨어
 * @param {string} permissionName - 필요한 권한 이름
 */
export const checkPermission = (permissionName) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: '인증이 필요합니다.',
        });
      }

      // super_admin은 모든 권한 보유
      if (req.user.role === 'super_admin') {
        return next();
      }

      // admin은 대부분의 권한 보유
      if (req.user.role === 'admin') {
        return next();
      }

      // customer는 제한된 권한만
      return res.status(403).json({
        success: false,
        message: `'${permissionName}' 권한이 필요합니다.`,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: '권한 확인 중 오류가 발생했습니다.',
        error: error.message,
      });
    }
  };
};

/**
 * 자신의 리소스만 접근 가능하도록 체크
 * @param {string} userIdField - 요청 파라미터에서 사용자 ID를 찾을 필드명
 */
export const checkOwnership = (userIdField = 'userId') => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: '인증이 필요합니다.',
      });
    }

    // 관리자는 모든 리소스에 접근 가능
    if (req.user.role === 'admin' || req.user.role === 'super_admin') {
      return next();
    }

    // 요청된 사용자 ID
    const requestedUserId =
      req.params[userIdField] || req.body[userIdField] || req.query[userIdField];

    if (String(requestedUserId) !== String(req.user.user_id)) {
      return res.status(403).json({
        success: false,
        message: '자신의 정보만 접근할 수 있습니다.',
      });
    }

    next();
  };
};

/**
 * 관리자 활동 로깅
 */
export const logAdminActivity = async (userId, action, resource, resourceId, details, req) => {
  try {
    // admin_activity_logs 테이블 존재 확인
    const [tables] = await db.query("SHOW TABLES LIKE 'admin_activity_logs'");

    if (tables.length === 0) {
      // 테이블 없으면 콘솔에만 로깅
      console.log('📝 Admin Activity:', {
        userId,
        action,
        resource,
        resourceId,
        details,
        timestamp: new Date().toISOString()
      });
      return;
    }

    const ipAddress = req.ip || req.connection?.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    await db.query(
      `INSERT INTO admin_activity_logs 
       (user_id, action, resource, resource_id, details, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        action,
        resource,
        resourceId,
        JSON.stringify(details),
        ipAddress,
        userAgent,
      ]
    );
  } catch (error) {
    console.error('관리자 활동 로깅 실패:', error.message);
  }
};

/**
 * 사용자의 모든 권한 조회
 */
export const getUserPermissions = async (userId) => {
  try {
    const [users] = await db.query(
      'SELECT role FROM users WHERE user_id = ?',
      [userId]
    );

    if (users.length === 0) {
      return [];
    }

    const role = users[0].role;

    // 역할별 기본 권한 반환
    const rolePermissions = {
      'super_admin': [
        { name: 'users.manage', resource: 'users', action: 'manage' },
        { name: 'products.manage', resource: 'products', action: 'manage' },
        { name: 'orders.manage', resource: 'orders', action: 'manage' },
      ],
      'admin': [
        { name: 'users.read', resource: 'users', action: 'read' },
        { name: 'products.manage', resource: 'products', action: 'manage' },
        { name: 'orders.manage', resource: 'orders', action: 'manage' },
      ],
      'customer': [
        { name: 'products.read', resource: 'products', action: 'read' },
        { name: 'orders.read_own', resource: 'orders', action: 'read_own' },
      ]
    };

    return rolePermissions[role] || [];
  } catch (error) {
    console.error('권한 조회 실패:', error);
    return [];
  }
};

/**
 * 사용자가 특정 권한을 가지고 있는지 확인
 */
export const hasPermission = async (userId, permissionName) => {
  try {
    const [users] = await db.query(
      'SELECT role FROM users WHERE user_id = ? AND is_active = TRUE',
      [userId]
    );

    if (users.length === 0) {
      return false;
    }

    const role = users[0].role;

    // super_admin은 모든 권한 보유
    if (role === 'super_admin') {
      return true;
    }

    // admin은 대부분의 권한 보유
    if (role === 'admin') {
      const adminRestricted = ['users.delete', 'users.manage_roles'];
      return !adminRestricted.includes(permissionName);
    }

    // customer는 제한된 권한만
    const customerPermissions = ['products.read', 'orders.read_own', 'orders.create'];
    return customerPermissions.includes(permissionName);
  } catch (error) {
    console.error('권한 확인 실패:', error);
    return false;
  }
};

/**
 * 역할 변경 (super_admin만 가능)
 */
export const changeUserRole = async (targetUserId, newRole, adminUserId) => {
  try {
    // 관리자 권한 확인
    const hasAuth = await hasPermission(adminUserId, 'users.manage_roles');

    if (!hasAuth) {
      throw new Error('역할 변경 권한이 없습니다.');
    }

    // 유효한 역할인지 확인
    const validRoles = ['customer', 'admin', 'super_admin'];
    if (!validRoles.includes(newRole)) {
      throw new Error('유효하지 않은 역할입니다.');
    }

    // super_admin 역할 변경 불가
    const [targetUser] = await db.query(
      'SELECT role FROM users WHERE user_id = ?',
      [targetUserId]
    );

    if (targetUser[0]?.role === 'super_admin') {
      throw new Error('최고 관리자의 역할은 변경할 수 없습니다.');
    }

    await db.query(
      'UPDATE users SET role = ?, updated_at = NOW() WHERE user_id = ?',
      [newRole, targetUserId]
    );

    return { success: true, message: '역할이 변경되었습니다.' };
  } catch (error) {
    throw error;
  }
};
