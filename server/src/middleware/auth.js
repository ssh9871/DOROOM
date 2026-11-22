// ⚠️ 개발용 임시 인증. 도로버스 계정 연동 방식이 정해지면 verifyToken 내부만 교체.
import jwt from 'jsonwebtoken';
import { AppError } from '../utils/errors.js';

export function signToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN ?? '7d' });
}

/** Authorization: Bearer <token> → req.userId */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(new AppError('UNAUTHORIZED'));
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = payload.userId;           // 모든 라우트는 req.userId만 믿는다
    next();
  } catch {
    next(new AppError('UNAUTHORIZED'));
  }
}
