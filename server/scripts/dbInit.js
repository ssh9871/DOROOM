// DB에 스키마(+초기 데이터) 넣기.  npm run db:init  /  npm run db:reset (전부 지우고 다시)
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const here = path.dirname(fileURLToPath(import.meta.url));
const dbDir = path.join(here, '..', 'src', 'db');
const reset = process.argv.includes('--reset');

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  if (reset) {
    await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    console.log('schema dropped');
  }
  const exists = await client.query(`SELECT 1 FROM information_schema.tables WHERE table_name = 'app_user'`);
  if (exists.rows.length) {
    console.log('tables already exist — skip (전부 다시 만들려면 npm run db:reset)');
  } else {
    await client.query(fs.readFileSync(path.join(dbDir, 'schema_v2.sql'), 'utf8'));
    console.log('schema_v2.sql applied');
    await client.query(fs.readFileSync(path.join(dbDir, 'seed_and_test_v2.sql'), 'utf8'));
    console.log('seed_and_test_v2.sql applied (테스트 계정 kim / lee, 비밀번호는 smoke 참고)');
  }
  // migrations/00N_*.sql 순서대로 (적용 기록: schema_migration 테이블)
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migration (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now())`);
  const migDir = path.join(dbDir, 'migrations');
  const files = fs.existsSync(migDir) ? fs.readdirSync(migDir).filter(f => /^\d{3}_.*\.sql$/.test(f)).sort() : [];
  for (const f of files) {
    const done = await client.query('SELECT 1 FROM schema_migration WHERE name = $1', [f]);
    if (done.rows.length) continue;
    await client.query('BEGIN');
    await client.query(fs.readFileSync(path.join(migDir, f), 'utf8'));
    await client.query('INSERT INTO schema_migration (name) VALUES ($1)', [f]);
    await client.query('COMMIT');
    console.log('migration applied:', f);
  }
} finally {
  await client.end();
}
