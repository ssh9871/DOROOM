// 🟦 매일 00:00 — 전날 돌봄이 없었던 펫의 배고픔 감소. 같은 날 두 번 실행돼도 state_checked_on 으로 한 번만 적용.
// 실행: npm run batch:daily  (실서비스에서는 OS 크론/스케줄러가 호출)
import 'dotenv/config';
import { pool, getSetting } from '../db/pool.js';

export async function runDailyHunger(db = pool) {
  const drop = await getSetting(db, 'DAILY_HUNGER_DROP', 20);
  const { rowCount } = await db.query(
    `UPDATE user_pet
        SET hunger = GREATEST(0, hunger - $1), state_checked_on = CURRENT_DATE
      WHERE (state_checked_on IS NULL OR state_checked_on < CURRENT_DATE)
        AND (last_interacted_at IS NULL OR last_interacted_at < CURRENT_DATE - INTERVAL '1 day')`, [drop]);
  return rowCount;
}

if (process.argv[1] && process.argv[1].endsWith('dailyHunger.js')) {
  runDailyHunger().then(n => { console.log(`dailyHunger: ${n} pets updated`); return pool.end(); });
}
