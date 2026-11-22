import { AppError } from '../utils/errors.js';

// 모든 라우트의 throw를 받아 {ok:false, error:{code,message}} 로 변환
export function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  if (err instanceof AppError) {
    return res.status(err.status).json({ ok: false, error: { code: err.code, message: err.message } });
  }
  // DB 제약 위반(CHECK/UNIQUE/FK)은 요청 값 문제로 취급
  if (err.code && /^23/.test(err.code)) {
    return res.status(400).json({ ok: false, error: { code: 'VALIDATION', message: err.detail ?? err.message } });
  }
  console.error(err);
  return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: '서버 오류' } });
}

/** async 라우트 핸들러 래퍼: 던진 에러를 errorHandler로 넘김 */
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
