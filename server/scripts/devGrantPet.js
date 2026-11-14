// 개발용: 테스트 계정에 펫 지급.   npm run dev:grant-pet -- <loginId> [speciesId]
//   예) npm run dev:grant-pet -- lee 2     → lee 에게 2번 종(고양이) 지급, userPetId 출력
// 이미 같은 종을 갖고 있으면 그 펫의 userPetId 를 알려주고 끝.
import 'dotenv/config';
import { pool } from '../src/db/pool.js';

const [loginId, speciesArg] = process.argv.slice(2);
if (!loginId) { console.error('사용법: npm run dev:grant-pet -- <loginId> [speciesId]'); process.exit(1); }
const speciesId = Number(speciesArg) || 2;

const u = await pool.query('SELECT user_id, nickname FROM app_user WHERE login_id = $1', [loginId]);
if (!u.rows.length) { console.error(`계정 없음: ${loginId}`); process.exit(1); }
const { user_id: userId, nickname } = u.rows[0];

const sp = await pool.query('SELECT name, grade FROM pet_species WHERE species_id = $1', [speciesId]);
if (!sp.rows.length) { console.error(`종 없음: speciesId=${speciesId}`); process.exit(1); }

const existing = await pool.query('SELECT user_pet_id FROM user_pet WHERE user_id = $1 AND species_id = $2', [userId, speciesId]);
let userPetId;
if (existing.rows.length) {
  userPetId = existing.rows[0].user_pet_id;
  console.log(`이미 보유: ${loginId}(${nickname}) 의 ${sp.rows[0].name} → userPetId = ${userPetId}`);
} else {
  const ins = await pool.query(
    `INSERT INTO user_pet (user_id, species_id, hunger, affection) VALUES ($1, $2, 100, 100) RETURNING user_pet_id`, [userId, speciesId]);
  userPetId = ins.rows[0].user_pet_id;
  console.log(`지급 완료: ${loginId}(${nickname}) 에게 ${sp.rows[0].name}(${sp.rows[0].grade}) → userPetId = ${userPetId}`);
}
await pool.end();
