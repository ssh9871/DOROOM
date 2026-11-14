// 명세서 0-2 응답 형식
export const ok = (res, data, status = 200) => res.status(status).json({ ok: true, data });
