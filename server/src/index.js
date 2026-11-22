import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { pool } from './db/pool.js';
import { errorHandler } from './middleware/errorHandler.js';

import auth from './routes/auth.js';
import me from './routes/me.js';
import mails from './routes/mails.js';
// 🟩 도로팜
import pets from './routes/pets.js';
import petSpecies from './routes/petSpecies.js';
import shop from './routes/shop.js';
import inventory from './routes/inventory.js';
import gacha from './routes/gacha.js';
import equipments from './routes/equipments.js';
import statUpgrades from './routes/statUpgrades.js';
// 🟥 미니게임
import stages from './routes/stages.js';
import game from './routes/game.js';
import ranking from './routes/ranking.js';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT now() AS db_time');
    res.json({ ok: true, data: { status: 'up', dbTime: rows[0].db_time } });
  } catch (e) {
    res.status(503).json({ ok: false, error: { code: 'DB_DOWN', message: 'DB에 연결할 수 없습니다. docker compose up -d 했는지 확인' } });
  }
});

// 🟦 공통
app.use('/auth', auth);
app.use('/me', me);
app.use('/mails', mails);
// 🟩 도로팜
app.use('/pets', pets);
app.use('/pet-species', petSpecies);
app.use('/shop', shop);
app.use('/inventory', inventory);
app.use('/gacha', gacha);
app.use('/equipments', equipments);
app.use('/stat-upgrades', statUpgrades);
// 🟥 미니게임
app.use('/stages', stages);
app.use('/game', game);
app.use('/ranking', ranking);

app.use((req, res) => res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: `${req.method} ${req.path}` } }));
app.use(errorHandler);

// DB 연결이 끊겨도 프로세스가 죽지 않게
pool.on('error', (e) => console.error('pg pool error:', e.message));

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`DOROOM server http://localhost:${port}`));
