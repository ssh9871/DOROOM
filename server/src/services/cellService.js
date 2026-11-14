// 🟦 공통 — 셀(재화) 변동은 반드시 이 파일의 함수로만.
// 잔액 갱신 + cell_transaction 기록을 한 트랜잭션에서 처리한다.
import { AppError } from '../utils/errors.js';

/**
 * 셀 증감.
 * @param client  withTransaction 안의 pg client (반드시 트랜잭션 안에서 호출)
 * @param userId
 * @param amount  +면 획득, -면 사용
 * @param reason  cell_transaction.reason CHECK 목록 중 하나
 *                GAME_REWARD, STAGE_FIRST_CLEAR, MAIL_CLAIM, RANK_REWARD, PET_GACHA, EQUIP_GACHA,
 *                DUPLICATE_REFUND, EVOLVE, ITEM_PURCHASE, EQUIP_MERGE, STAT_UPGRADE, ADMIN
 * @param refId   관련 id (run_id, mail_id, gacha_id ...). 보상 중복 방지 인덱스에 쓰임
 * @returns 변동 후 잔액
 */
export async function addCell(client, userId, amount, reason, refId = null) {
  if (!Number.isInteger(amount) || amount === 0) throw new AppError('VALIDATION', 'amount는 0이 아닌 정수');

  // 잔액 행 잠금 (동시 요청으로 두 번 차감되는 것 방지)
  const { rows } = await client.query(
    'SELECT cell_balance FROM app_user WHERE user_id = $1 FOR UPDATE', [userId]);
  if (!rows.length) throw new AppError('NOT_FOUND', '회원 없음');

  const after = rows[0].cell_balance + amount;
  if (after < 0) throw new AppError('NOT_ENOUGH_CELL');

  await client.query('UPDATE app_user SET cell_balance = $2 WHERE user_id = $1', [userId, after]);
  await client.query(
    `INSERT INTO cell_transaction (user_id, amount, balance_after, reason, ref_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, amount, after, reason, refId]);
  return after;
}

/** 잔액 조회 (트랜잭션 밖에서도 가능) */
export async function getBalance(db, userId) {
  const { rows } = await db.query('SELECT cell_balance FROM app_user WHERE user_id = $1', [userId]);
  if (!rows.length) throw new AppError('NOT_FOUND', '회원 없음');
  return rows[0].cell_balance;
}

/** 셀 내역 (최근순) → CellTransaction[] */
export async function listTransactions(db, userId, limit = 50) {
  const { rows } = await db.query(
    `SELECT tx_id, amount, balance_after, reason, created_at
       FROM cell_transaction WHERE user_id = $1
      ORDER BY tx_id DESC LIMIT $2`, [userId, limit]);
  return rows.map(r => ({
    txId: r.tx_id, amount: r.amount, balanceAfter: r.balance_after,
    reason: r.reason, createdAt: r.created_at,
  }));
}
