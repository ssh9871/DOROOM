// 🟦 매주 월 00:00 — 지난주 v_weekly_ranking 기준 우편 발송 (1위는 칭호 포함). 같은 주 재실행 시 중복 발송 안 함.
// 실행: npm run batch:weekly
import 'dotenv/config';
import { pool, withTransaction, getSetting } from '../db/pool.js';

export async function runWeeklyRanking(weekStart /* 'YYYY-MM-DD' | undefined = 지난주 */) {
  return withTransaction(async (client) => {
    // 지난주 월요일 (한국시간 기준)
    const ws = weekStart ?? (await client.query(
      `SELECT (date_trunc('week', (now() AT TIME ZONE 'Asia/Seoul')) - INTERVAL '7 days')::date AS ws`)).rows[0].ws;
    const top1 = await getSetting(client, 'RANK_REWARD_TOP1', 300);
    const top3 = await getSetting(client, 'RANK_REWARD_TOP3', 200);
    const top10 = await getSetting(client, 'RANK_REWARD_TOP10', 100);
    const title = await client.query(`SELECT title_id FROM title WHERE code = 'WEEKLY_TOP1'`);
    const titleId = title.rows[0]?.title_id ?? null;

    const { rows } = await client.query(
      `SELECT user_id, rank_no, best_score FROM v_weekly_ranking WHERE week_start = $1 AND rank_no <= 10`, [ws]);
    let sent = 0;
    for (const r of rows) {
      const cell = r.rank_no === 1 ? top1 : r.rank_no <= 3 ? top3 : top10;
      const res = await client.query(
        `INSERT INTO reward_mail (user_id, source_type, source_key, title, cell_amount, title_id, expires_at)
         VALUES ($1, 'RANKING', $2, $3, $4, $5, now() + INTERVAL '14 days')
         ON CONFLICT DO NOTHING`,
        [r.user_id, `${ws}:${r.user_id}`, `주간 랭킹 ${r.rank_no}위 보상 (${r.best_score}점)`, cell,
         r.rank_no === 1 ? titleId : null]);
      sent += res.rowCount;
    }
    return { weekStart: ws, sent };
  });
}

if (process.argv[1] && process.argv[1].endsWith('weeklyRanking.js')) {
  runWeeklyRanking(process.argv[2]).then(r => { console.log('weeklyRanking:', r); return pool.end(); });
}
