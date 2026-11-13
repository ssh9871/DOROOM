// 🟦 공통 — ⚠️ 개발용 임시 인증. 도로버스 계정 연동이 정해지면 이 파일은 교체된다.
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../db/pool.js';
import { ok } from '../utils/response.js';
import { AppError } from '../utils/errors.js';
import { wrap } from '../middleware/errorHandler.js';
import { signToken } from '../middleware/auth.js';
import { getUserDto } from './me.js';

const router = Router();

// POST /auth/signup  {loginId, password, nickname} → {userId, nickname}
router.post('/signup', wrap(async (req, res) => {
  const { loginId, password, nickname } = req.body ?? {};
  if (!loginId || !password || !nickname) throw new AppError('VALIDATION', 'loginId, password, nickname 필요');
  const hash = await bcrypt.hash(password, 10);
  try {
    const { rows } = await pool.query(
      `INSERT INTO app_user (login_id, password_hash, nickname) VALUES ($1, $2, $3)
       RETURNING user_id, nickname`, [loginId, hash, nickname]);
    ok(res, { userId: rows[0].user_id, nickname: rows[0].nickname }, 201);
  } catch (e) {
    if (e.code === '23505') throw new AppError('VALIDATION', '이미 사용 중인 아이디 또는 닉네임');
    throw e;
  }
}));

// POST /auth/login  {loginId, password} → {token, user: User}
router.post('/login', wrap(async (req, res) => {
  const { loginId, password } = req.body ?? {};
  const { rows } = await pool.query(
    'SELECT user_id, password_hash FROM app_user WHERE login_id = $1', [loginId]);
  if (!rows.length || !(await bcrypt.compare(password ?? '', rows[0].password_hash))) {
    throw new AppError('UNAUTHORIZED', '아이디 또는 비밀번호가 틀렸습니다');
  }
  const userId = rows[0].user_id;
  ok(res, { token: signToken(userId), user: await getUserDto(pool, userId) });
}));

export default router;
