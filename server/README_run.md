# DOROOM 서버 실행 방법

> 처음 한 번만 1~3, 그 뒤로는 4만. 전체 5분.

## 1. 준비
- Node.js 20 이상 (`node -v`로 확인. 클라이언트와 같은 Node 24면 됨)
- Docker Desktop 실행 중 (DB용)

## 2. DB 켜기
```
cd server/src/db
docker compose up -d
```
pgAdmin(`localhost:5050`)은 안 열어도 됨. 서버가 직접 DB에 붙음.

## 3. 서버 설치 + DB 초기화
```
cd server
npm install
copy .env.example .env        (Mac/Linux: cp .env.example .env)
npm run db:init
```
`.env`는 그대로 써도 됨 (docker-compose의 doroom/doroom 계정과 맞춰져 있음).
`db:init`은 테이블이 없을 때만 schema_v2 + seed를 넣고, `migrations/00N_*.sql`이 있으면 순서대로 적용. 다시 만들고 싶으면 `npm run db:reset`.

## 4. 서버 실행
```
npm run dev
```
`DOROOM server http://localhost:3000` 뜨면 성공. 파일 저장하면 자동 재시작.

## 5. 확인
```
npm run smoke
```
(서버 켜둔 채 다른 터미널에서) 가입 → 로그인 → 셀 → 펫 경험치 → 전투 능력치 → 우편 수령까지 자동으로 눌러보고 ✅/❌ 출력. 전부 ✅면 바닥은 정상.

브라우저에서 `http://localhost:3000/health` 열어서 `{"ok":true,...}` 나오는지만 봐도 됨.

## 폴더 구조
```
server/
├─ src/
│  ├─ index.js              앱 진입점. 라우트 등록
│  ├─ db/
│  │  ├─ pool.js            DB 연결, withTransaction(), getSetting()
│  │  ├─ schema_v2.sql      테이블
│  │  ├─ seed_and_test_v2.sql  초기 데이터
│  │  └─ migrations/        스키마 변경은 여기에 001_xxx.sql
│  ├─ middleware/
│  │  ├─ auth.js            requireAuth → req.userId  (⚠️ 개발용 임시, 도로버스 연동 시 교체)
│  │  └─ errorHandler.js    throw → {ok:false,error}, wrap()
│  ├─ utils/
│  │  ├─ errors.js          AppError('NOT_ENOUGH_CELL') — 명세서 0-3 코드 전부
│  │  └─ response.js        ok(res, data)
│  ├─ services/             🟦 공통 함수 — 셀·경험치·아이템은 여기만 통해서
│  │  ├─ cellService.js     addCell, getBalance, listTransactions
│  │  ├─ petService.js      addPetExp, getPetCombatStats, assertPetCanSortie, getPet, toPetDto
│  │  └─ inventoryService.js addItem, useItem, addEquipment, useEquipment, getInventory
│  ├─ routes/
│  │  ├─ auth.js, me.js, mails.js            🟦 완성
│  │  ├─ pets.js, petSpecies.js, shop.js,    🟩 도로팜 — 스텁 (501). 채우면 됨
│  │  │  inventory.js(완성), gacha.js, equipments.js, statUpgrades.js
│  │  └─ stages.js, game.js, ranking.js      🟥 미니게임 — 스텁 (501)
│  └─ batch/
│     ├─ dailyHunger.js     npm run batch:daily
│     └─ weeklyRanking.js   npm run batch:weekly
└─ scripts/
   ├─ dbInit.js
   └─ smoke.js
shared/types.ts              DTO 타입 (클라이언트·서버 공용)
```

## 라우트 하나 채우는 법 (예: GET /pets)
```js
// routes/pets.js
import { pool } from '../db/pool.js';
import { getSetting } from '../db/pool.js';
import { toPetDto } from '../services/petService.js';

router.get('/', wrap(async (req, res) => {
  const { rows } = await pool.query(`SELECT ... FROM user_pet p JOIN ... WHERE p.user_id = $1`, [req.userId]);
  const min = await getSetting(pool, 'SORTIE_MIN_HUNGER', 30);
  ok(res, rows.map(r => toPetDto(r, min)));
}));
```
- `req.userId`는 requireAuth가 넣어줌. 클라이언트가 보낸 userId는 쓰지 않음
- 셀을 바꾸는 처리는 `withTransaction(async (client) => { await addCell(client, ...); ... })` 안에서
- 실패는 `throw new AppError('코드')` — 응답 형식은 errorHandler가 만들어줌
- 에러 코드가 목록에 없으면 `utils/errors.js`에 추가하고 명세서 0-3도 같이

## 클라이언트에서 호출
```ts
import type { ApiResponse, User } from '../../shared/types';
const res = await fetch('http://localhost:3000/me', { headers: { Authorization: `Bearer ${token}` } });
const body: ApiResponse<User> = await res.json();
if (body.ok) console.log(body.data.nickname);
```
