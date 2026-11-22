// PostgreSQL 연결 풀. 모든 DB 접근은 이 파일을 통해서.
import pg from 'pg';
import 'dotenv/config';

// pg 기본값 보정: BIGINT(run_id, tx_id 등)는 문자열 대신 숫자로, DATE(week_start)는 Date 객체 대신 'YYYY-MM-DD' 문자열로
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));   // int8
pg.types.setTypeParser(1082, (v) => v);                               // date

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

/** 단발 쿼리 */
export const query = (text, params) => pool.query(text, params);

/**
 * 트랜잭션 헬퍼. fn(client) 안에서 던지면 롤백.
 *   const result = await withTransaction(async (client) => { ... return x; });
 */
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/** game_setting 값 읽기 (숫자) */
export async function getSetting(client, key, fallback) {
  const { rows } = await (client ?? pool).query(
    'SELECT setting_value FROM game_setting WHERE setting_key = $1', [key]);
  return rows.length ? Number(rows[0].setting_value) : fallback;
}
