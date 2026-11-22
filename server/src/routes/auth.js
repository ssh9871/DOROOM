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
// shortcut: accounts match the current seed; mark demo accounts in the DB when the roster grows.
const demoLoginIds = ['kim', 'lee'];

function requireLocalDemo(req, res, next) {
  const origin = req.get('origin');
  const localIp = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.ip);
  const localHost = ['localhost', '127.0.0.1', '[::1]'].includes(req.hostname);
  if (process.env.NODE_ENV === 'production' || process.env.DEMO_ACCOUNT_LOGIN !== 'true' ||
      !localIp || !localHost || (origin && !/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin))) {
    return next(new AppError('NOT_FOUND'));
  }
  res.set('Cache-Control', 'no-store');
  next();
}

router.get('/demo-accounts', requireLocalDemo, wrap(async (req, res) => {
  const { rows } = await pool.query(
    'SELECT login_id AS "loginId", nickname FROM app_user WHERE login_id = ANY($1) ORDER BY login_id',
    [demoLoginIds]);
  ok(res, rows);
}));

router.post('/demo-login', requireLocalDemo, wrap(async (req, res) => {
  const { loginId } = req.body ?? {};
  if (!demoLoginIds.includes(loginId)) throw new AppError('NOT_FOUND', '테스트 계정을 찾을 수 없습니다');
  const { rows } = await pool.query('SELECT user_id FROM app_user WHERE login_id = $1', [loginId]);
  if (!rows.length) throw new AppError('NOT_FOUND', '테스트 계정을 찾을 수 없습니다');
  ok(res, { token: signToken(rows[0].user_id), user: await getUserDto(pool, rows[0].user_id) });
}));

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
