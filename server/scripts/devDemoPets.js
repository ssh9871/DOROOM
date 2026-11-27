// 개발용: 시연 상태로 맞추기 — 테스트 계정이 가진 펫을 강아지·고양이·판다·구미호 4마리로 만든다.
//   npm run dev:demo-pets            → 모든 계정
//   npm run dev:demo-pets -- lee     → lee 계정만
// 다른 펫은 지우고, 없는 펫은 새로 넣는다. 대표 펫이 없어지면 고양이를 대표로 둔다.
import 'dotenv/config';
import { pool, withTransaction } from '../src/db/pool.js';

const DEMO = ['dog', 'cat', 'panda', 'gumiho'];
const [loginId] = process.argv.slice(2);

await withTransaction(async (client) => {
  const users = (await client.query(
    'SELECT user_id, login_id FROM app_user WHERE ($1::text IS NULL OR login_id = $1) ORDER BY user_id', [loginId ?? null])).rows;
  if (!users.length) throw new Error(`계정 없음: ${loginId}`);
  const species = (await client.query('SELECT species_id, code FROM pet_species WHERE code = ANY($1)', [DEMO])).rows;
  if (species.length !== DEMO.length) throw new Error('강아지·고양이·판다·구미호 종이 없습니다. npm run db:init 을 먼저 실행하세요.');
  for (const u of users) {
    const removed = await client.query(
      `DELETE FROM user_pet p USING pet_species s
        WHERE p.species_id = s.species_id AND p.user_id = $1 AND (s.code IS NULL OR NOT (s.code = ANY($2)))`, [u.user_id, DEMO]);
    for (const s of species) {
      await client.query(
        `INSERT INTO user_pet (user_id, species_id, hunger, affection) VALUES ($1, $2, 100, 100)
         ON CONFLICT (user_id, species_id) DO NOTHING`, [u.user_id, s.species_id]);
    }
    const rep = await client.query('SELECT 1 FROM user_pet WHERE user_id = $1 AND is_representative', [u.user_id]);
    if (!rep.rows.length) {
      await client.query(
        `UPDATE user_pet SET is_representative = TRUE
          WHERE user_id = $1 AND species_id = (SELECT species_id FROM pet_species WHERE code = 'cat')`, [u.user_id]);
    }
    console.log(`${u.login_id}: 강아지·고양이·판다·구미호로 맞춤 (지운 펫 ${removed.rowCount}마리)`);
  }
});
await pool.end();
