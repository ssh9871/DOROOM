# DOROOM API 명세서 v1

> 목적: 미니게임 팀(석훈·기범)과 도로팜 팀(길·창규)이 **같은 이름·같은 응답 형태**로 개발하기 위한 약속
> 서버: Node.js + Express / DB: PostgreSQL 16 (`schema_v2.sql`) / 모든 응답은 JSON
> 담당 표시: 🟦 공통(창규) · 🟩 도로팜 · 🟥 미니게임
> 상태: v1.1 (11/14 미니게임 5장·강화 반영). 밸런스 수치·공식은 [가정]이며 바뀌어도 주소·응답 모양은 유지. 능력치 코드(ATTACK 등)는 미니게임 팀이 확정하면 CombatStats 필드명만 맞춤
> 이 문서에서 바꾸고 싶은 게 있으면 **먼저 여기를 고치고** 코드를 고친다.

---

## 0. 공통 규칙 (전원 필독)

### 0-1. 이름 규칙

| 대상 | 규칙 | 예 |
| --- | --- | --- |
| DB 테이블·컬럼 | snake_case | user_pet, cell_balance |
| JSON 필드 | camelCase | userPetId, cellBalance |
| URL 경로 | 소문자 복수 명사, kebab-case | /pets, /stat-upgrades |
| 상수값 | 대문자 스네이크 | NORMAL, RARE, LEGEND, ENDLESS |
| 서버 파일 | routes/도메인.js, services/도메인Service.js | routes/pets.js, services/cellService.js |

### 0-2. 응답 형식

```json
// 성공
{ "ok": true, "data": { ... } }

// 실패
{ "ok": false, "error": { "code": "NOT_ENOUGH_CELL", "message": "셀이 부족합니다" } }
```

### 0-3. 에러 코드

| 코드 | 의미 | HTTP |
| --- | --- | --- |
| UNAUTHORIZED | 로그인 필요 | 401 |
| NOT_FOUND | 대상 없음 | 404 |
| NOT_ENOUGH_CELL | 셀 부족 | 400 |
| NOT_ENOUGH_ITEM | 아이템·장비 수량 부족 | 400 |
| PET_TOO_HUNGRY | 배고픔이 출전 기준 미만 | 400 |
| SLOT_LOCKED | 장비 슬롯 미해금 | 400 |
| LEVEL_NOT_ENOUGH | 진화 레벨 미달 | 400 |
| DAILY_LIMIT | 하루 뽑기 제한 초과 | 400 |
| ALREADY_FINISHED | 이미 종료된 판 | 409 |
| ALREADY_CLAIMED | 이미 받은 우편 | 409 |
| VALIDATION | 요청 값 오류 | 400 |

### 0-4. 인증

- 로그인 성공 시 JWT 발급 → 이후 모든 요청 헤더에 `Authorization: Bearer <token>`
- 서버는 토큰에서 userId를 꺼내 씀. **클라이언트가 보낸 userId는 절대 믿지 않음**

### 0-4-1. 나중에 추가될 때 같이 바꿀 것
- 퀘스트 → `cell_transaction.reason`에 `QUEST_REWARD` 추가 (CHECK 제약 수정) / 크로마 스킨 → `SKIN_PURCHASE` 추가. reason 값을 새로 쓸 땐 **반드시 창규에게** — DB CHECK에 없는 값은 INSERT가 실패함

### 0-5. 공통 서비스 함수 (🟦 창규 작성, 두 팀 모두 이것만 호출)

셀·경험치·펫 상태를 바꾸는 코드는 **반드시 이 함수로만**. 각자 UPDATE 문을 쓰지 않는다.

```js
// services/cellService.js
addCell(client, userId, amount, reason, refId)
//  +면 획득, -면 사용. 잔액 갱신 + cell_transaction 기록을 한 트랜잭션으로.
//  부족하면 NOT_ENOUGH_CELL throw

// services/petService.js
addPetExp(client, userPetId, exp)       // 경험치 추가 + 레벨업 계산 (등급별 base_exp_per_level)
getPetCombatStats(userId, userPetId)    // 등급 기본값 × 진화 배율 + 장착 장비 + 영구 강화 (레벨 무관, 11/13 확정)
assertPetCanSortie(userPetId)           // 배고픔 검사, 미달이면 PET_TOO_HUNGRY throw

// services/inventoryService.js
addItem(client, userId, itemId, qty)
useItem(client, userId, itemId, qty)    // 부족하면 NOT_ENOUGH_ITEM throw
addEquipment(client, userId, equipmentId, qty)
```

- `client`는 트랜잭션용 pg 클라이언트. 호출하는 쪽이 `BEGIN / COMMIT`을 감싼다.

---

## 1. 🟦 공통 — 인증·회원

> ⚠️ 회원가입·로그인은 **개발·테스트용 임시**. 학생 계정은 도로버스가 이미 갖고 있으므로, 최종본에서는 도로버스가 넘겨주는 학생 식별 정보(토큰 또는 ID)로 app_user를 연결한다. 연동 방식은 팀장님께 확인 필요. 나머지 API는 "토큰에서 userId를 꺼내는" 부분만 바뀌고 영향 없음.


| API | 설명 | 요청 → 응답 data |
| --- | --- | --- |
| POST /auth/signup | **[개발용 임시]** 테스트 계정 생성 | {loginId, password, nickname} → {userId, nickname} |
| POST /auth/login | **[개발용 임시]** 테스트 로그인 | {loginId, password} → {token, user: User} |
| GET /me | 내 정보 | → User |
| GET /me/cells | 셀 내역 | ?limit=50 → {balance, transactions: CellTransaction[]} |
| GET /me/titles | 보유 칭호 | → {equippedTitleId, titles: Title[]} |
| PATCH /me/title | 칭호 장착 | {titleId} (null이면 해제) → User |

---

## 2. 🟩 도로팜 — 펫

| API | 설명 | 요청 → 응답 data |
| --- | --- | --- |
| GET /pets | 내 펫 목록 | → Pet[] |
| GET /pets/:userPetId | 펫 상세 (장비·전투 능력치 포함) | → PetDetail |
| PATCH /pets/:userPetId | 이름 변경·대표 설정 | {nickname?, isRepresentative?} → Pet |
| POST /pets/:userPetId/feed | 밥·간식·장난감 주기 | {itemId} → {pet: Pet, used: Item} |
| POST /pets/:userPetId/pat | 쓰다듬기 (아이템 없음) | → Pet |
| POST /pets/:userPetId/use-potion | 경험치 포션 | {itemId} → Pet |
| POST /pets/:userPetId/evolve | 진화 | → Pet |
| POST /pets/transfer-exp | 경험치 전승 | {fromUserPetId, toUserPetId} → {from: Pet, to: Pet, transfer: ExpTransfer} |
| GET /pet-species | 펫 도감 (등급·능력) | → PetSpecies[] |

**서버 처리 메모**
- feed: user_item −1 → user_pet 배고픔·호감도 갱신 → pet_interaction_log 기록. interaction_type 매핑: FOOD·SNACK → `FEED`, TOY → `PLAY`, 쓰다듬기(pat) → `PET`
- 레벨업: 필요 경험치 = `현재 레벨 × pet_grade_rule.base_exp_per_level`, 최대 레벨(max_level)에서는 경험치 안 쌓임 [가정]. `expToNext`는 서버가 계산해서 내려줌
- evolve: pet_evolution_rule에서 요구 레벨·비용 확인 → addCell(−, EVOLVE) → evolution_stage +1
- 전승 규칙: `toLevel = max(1, floor(fromLevel × ratio))`, ratio = 같은 등급 1.0 / 상위 등급으로 pet_grade_rule.transfer_ratio / 하위 등급으로는 VALIDATION. 전승 후 from 펫은 Lv.1·경험치 0

---

## 3. 🟩 도로팜 — 상점·뽑기·인벤토리

| API | 설명 | 요청 → 응답 data |
| --- | --- | --- |
| GET /shop/items | 상점 아이템 목록 | → Item[] |
| POST /shop/buy | 아이템 구매 | {itemId, quantity} → {balance, item: UserItem} |
| GET /inventory | 인벤토리 (아이템 + 장비) | → {items: UserItem[], equipments: UserEquipment[]} |
| GET /gacha/pools | 뽑기 종류·확률 | → GachaPool[] |
| POST /gacha/pools/:poolId/draw | 뽑기 1회 | → GachaResult |
| GET /gacha/history | 내 뽑기 기록 | ?limit=50 → GachaLog[] |

**뽑기 서버 처리 순서 (한 트랜잭션)**
1. 오늘 뽑은 횟수 확인 (gacha_log) → 초과면 DAILY_LIMIT
2. 잔액 행 잠금 후 addCell(−, PET_GACHA 또는 EQUIP_GACHA)
3. gacha_pool_entry weight로 추첨 (천장 도달 시 최고 등급 보장)
4. gacha_log 기록
5. 펫: 이미 있으면 isDuplicate=true + addCell(+, DUPLICATE_REFUND) / 없으면 user_pet 생성
   장비: user_equipment 수량 +1

---

## 4. 🟩 도로팜 — 장비·스탯 강화

| API | 설명 | 요청 → 응답 data |
| --- | --- | --- |
| GET /equipments | 장비 도감 (등급별 수치·합치기 조건) | → Equipment[] |
| POST /equipments/merge | 같은 장비 n개 + 셀 → 다음 등급 | {equipmentId} → {consumed: UserEquipment, created: UserEquipment, balance} |
| PUT /pets/:userPetId/equipments/:slotNo | 장착 (교체 포함) | {equipmentId} → PetDetail |
| DELETE /pets/:userPetId/equipments/:slotNo | 해제 | → PetDetail |
| GET /stat-upgrades | 영구 강화 현황 (8종: 펫용 4 + 미니게임용 4) ✅ 구현 | → StatUpgrade[] |
| POST /stat-upgrades/:statCode | 1단계 구매 (셀 차감 + 단계 갱신, 한 트랜잭션) ✅ 구현 | → {upgrade: StatUpgrade, balance} |

**영구 강화 코드 (stat_code 테이블, 11/14)**

| 코드 | 이름 | scope | 단위 | 최대 | 단계별 비용(셀) | 누적 효과 |
| --- | --- | --- | --- | ---: | --- | --- |
| ATTACK / MAX_HP / MOVE_SPEED / BULLET_SPEED | 공격력 / 체력 / 이동속도 / 탄속 | PET (getPetCombatStats 에 합산) | FLAT | 5 | 50 / 100 / 150 / 200 / 250 | +5 씩 [가정] |
| PROJECTILE_COUNT | 발사체 개수 | MINIGAME (GameStart.upgrades) | FLAT | 2 | 120 / 300 | +1발 씩 |
| DAMAGE | 피해량 | MINIGAME | PERCENT | 5 | 60 / 100 / 150 / 220 / 320 | +10% 씩 |
| PROJECTILE_SIZE | 발사체 크기 | MINIGAME | PERCENT | 5 | 50 / 80 / 120 / 180 / 260 | +10% 씩 |
| HP | 체력 | MINIGAME | FLAT | 3 | 80 / 150 / 280 | +1 HP 씩 |

`valueBonus` 는 현재 단계까지의 **누적** 값 (DAMAGE 2단계 = 20 → +20%). 미니게임용은 서버가 합산하지 않고 `GameStart.upgrades` 로 넘기면 게임이 적용.

**서버 처리 메모**
- 장착: pet_grade_rule.equip_slot_count로 슬롯 해금 검사 → 안 열렸으면 SLOT_LOCKED. slotNo와 slotType은 1=HEAD, 2=BODY, 3=ACCESSORY 고정 [가정]
- 장착된 장비는 인벤토리 수량에서 빠지지 않음 (수량은 보유, 장착은 참조). 한 장비를 여러 펫에 동시 장착 가능 [가정]
- merge: user_equipment −merge_count → addCell(−, EQUIP_MERGE) → next_equipment_id 수량 +1

---

## 5. 🟥 미니게임 — 게임·스테이지·랭킹  ✅ 11/14 서버 구현 완료

| API | 설명 | 요청 → 응답 data |
| --- | --- | --- |
| GET /stages | 12개 지점(1-1 ~ 4-3) + 내 해금·클리어 상태 + 무한모드 해금 여부 | → StageList = {stages: Stage[], endlessUnlocked} |
| POST /game/start | 게임 시작 (출전 검증 → 능력치·강화 반환 → game_run 생성) | {mode: "STAGE" 또는 "ENDLESS", stageNo?, userPetId, buffItemIds?, practice?} → GameStart |
| POST /game/:runId/finish | 게임 종료 + 보상 (서버가 점수 계산) | {survivalMs, killCount, reachedWave, cleared, reviveUsed} → GameResult |
| POST /game/:runId/abort | 중도 포기 (보상 없음) | → {runId} |
| GET /game/history | 내 전적 | ?mode=ENDLESS&limit=20&offset=0 → GameRun[] |
| GET /ranking | 주간 랭킹 | ?weekStart=YYYY-MM-DD&limit=10 → Ranking = {weekStart, myRank, entries} |

**지점 ID**: 표시 ID `w-s` ↔ `stageNo = (w-1)×3 + s` (1-1=1 … 4-3=12). 작전 w 의 세 번째 지점(w-3)이 보스전(`isBoss`).

**해금 규칙**: 1-1 기본 해금 → 직전 지점 클리어 시 다음 지점 해금 → **4-3 클리어 시 무한모드 해금**. 안 열린 지점/무한모드로 start 하면 VALIDATION.

**연습 모드 (`practice: true`)**: 기록·보상·랭킹 전부 제외. `runId` 는 null, 잠긴 지점도 입장 가능, 버프 아이템 소모 없음. finish 호출 불필요. 디버그용.

**게임 시작 (start) 서버 순서**
1. `userPetId` 가 내 펫인지 → 아니면 NOT_FOUND / assertPetCanSortie → 배고픔 미달이면 PET_TOO_HUNGRY
2. 해금 검사 (연습 모드 제외)
3. getPetCombatStats → `combatStats`, 영구 강화 목록 → `upgrades` (미니게임용 PROJECTILE_COUNT/DAMAGE/PROJECTILE_SIZE/HP 포함, 게임 안에서 적용)
4. buffItemIds 소모 → game_run INSERT (PLAYING, 펫 종·레벨·진화 스냅샷) → `runId`

**게임 종료 (finish) 서버 순서**
1. `req.userId` 소유의 run 만 (남의 run 은 NOT_FOUND). 행 잠금(FOR UPDATE) → finish/abort 동시 요청에도 한쪽만 확정
2. 이미 FINISHED → **저장된 결과를 그대로 반환** (`replayed: true`, 보상 재지급 없음 — 응답 유실 대비) / ABORTED → ALREADY_FINISHED
3. 검증: `survivalMs ≤ 서버 경과 시간 + 5초`, `killCount ≤ (초 × 20) + 20`, 무한모드에 cleared=true 불가 → VALIDATION
4. **점수 = floor(survivalMs/1000) × 10 + killCount × 5 + (cleared ? 지점 clearBonusScore : 0)**
5. 보상: 무한모드 셀 = floor(score/100) / 스테이지 클리어 = repeatRewardCell + 첫 클리어면 firstClearRewardCell (user_stage_clear PK 로 동시 첫 클리어도 1회) / 경험치 = floor(score/10) → addPetExp
6. addCell(GAME_REWARD, STAGE_FIRST_CLEAR; ref_id = runId → 유니크 인덱스가 중복 지급 차단), game_run UPDATE(FINISHED, week_start)
7. 한 트랜잭션. 중간 실패 시 전부 롤백

**week_start**: 종료 시각을 **한국시간**으로 본 그 주 **월요일** 날짜 (`date_trunc('week', ended_at AT TIME ZONE 'Asia/Seoul')`). 주간 보상 배치의 "지난주"도 같은 기준.

**랭킹**: `v_weekly_ranking` 뷰 = 주차별 · ENDLESS · FINISHED 판의 사람당 MAX(score). **동점이면 그 점수를 먼저 달성한 계정이 위** (`achievedAt`). 상위 10명 + 내 순위. 지난주는 `?weekStart=`.

**지점별 가산점·보상 [가정] (석훈 팀이 조정 가능, stage 테이블 값만 바꾸면 됨)**

| 지점 | 클리어 가산점 | 첫 클리어 셀 | 반복 셀 |
| --- | ---: | ---: | ---: |
| 1-1 / 1-2 / 1-3(보스) | 50 / 100 / 250 | 40 / 50 / 110 | 7 / 9 / 11 |
| 2-1 / 2-2 / 2-3(보스) | 200 / 250 / 400 | 70 / 80 / 140 | 12 / 14 / 16 |
| 3-1 / 3-2 / 3-3(보스) | 350 / 400 / 550 | 100 / 110 / 170 | 17 / 19 / 21 |
| 4-1 / 4-2 / 4-3(보스) | 500 / 550 / 700 | 130 / 140 / 200 | 22 / 24 / 26 |

공식: 가산점 = (w−1)×150 + s×50 (+보스 100), 첫 클리어 = w×30 + s×10 (+보스 50), 반복 = w×5 + s×2

---

## 6. 🟦 공통 — 우편함·배치

| API | 설명 | 요청 → 응답 data |
| --- | --- | --- |
| GET /mails | 우편 목록 | ?unclaimedOnly=true → Mail[] |
| POST /mails/:mailId/claim | 받기 | → {balance, mail: Mail} |

| 배치 | 시각 | 내용 |
| --- | --- | --- |
| dailyHunger | 매일 00:00 | 전날 돌봄 없는 펫 배고픔 감소 (state_checked_on으로 중복 실행 방지) |
| weeklyRanking | 매주 월 00:00 | v_weekly_ranking 기준 reward_mail 발송 |

---

## 7. 공통 DTO (응답 객체 이름·필드)

프론트 TypeScript 타입과 서버 응답을 **이 이름 그대로** 맞춘다. 파일 위치: `shared/types.ts` [제안]

```ts
type Grade = "NORMAL" | "RARE" | "LEGEND";

interface User {
  userId: number; loginId: string; nickname: string; cellBalance: number; equippedTitle: Title | null;
}
interface Title { titleId: number; code: string; name: string; }
interface CellTransaction {
  txId: number; amount: number; balanceAfter: number; reason: string; createdAt: string;
}

interface Ability { abilityId: number; code: string; name: string; effectValue: number; cooldownSec: number; }
interface PetSpecies { speciesId: number; name: string; grade: Grade; ability: Ability; modelUrl: string | null; }
interface Pet {
  userPetId: number; species: PetSpecies; nickname: string | null;
  level: number; exp: number; expToNext: number; evolutionStage: number;
  hunger: number; affection: number; isRepresentative: boolean; canSortie: boolean;
}
interface PetDetail extends Pet {
  equipSlotCount: number;                                        // 해금된 칸 수
  equipments: { slotNo: number; equipment: Equipment | null }[]; // 길이 3
  combatStats: CombatStats;
  nextEvolution: { requiredLevel: number; cellCost: number } | null;
}
interface CombatStats {
  attack: number; maxHp: number; moveSpeed: number; bulletSpeed: number;
  ability: Ability; canRevive: boolean;
}
interface ExpTransfer { transferId: number; fromLevel: number; toLevelBefore: number; toLevelAfter: number; }

interface Item {
  itemId: number; code: string; name: string;
  itemType: "FOOD" | "SNACK" | "TOY" | "EXP_POTION" | "EVOLVE_STONE" | "GAME_BUFF";
  priceCell: number; hungerRestore: number; affectionRestore: number; expGain: number; effectConfig: object;
}
interface UserItem { item: Item; quantity: number; }
interface Equipment {
  equipmentId: number; lineCode: string; name: string;
  slotType: "HEAD" | "BODY" | "ACCESSORY"; grade: Grade;
  statCode: string; statValue: number;
  nextEquipmentId: number | null; mergeCount: number | null; mergeCellCost: number;
  modelUrl: string | null;
}
interface UserEquipment { equipment: Equipment; quantity: number; }
interface StatUpgrade {
  statCode: string; name: string; unit: "FLAT" | "PERCENT"; scope: "PET" | "MINIGAME";
  level: number; maxLevel: number; valueBonus: number; nextCellCost: number | null;
}
interface StatUpgradeBuyResult { upgrade: StatUpgrade; balance: number; }

interface GachaPool {
  poolId: number; poolType: "PET" | "EQUIPMENT"; name: string; costCell: number;
  pityCount: number | null; dailyLimit: number | null; drawnToday: number;
  entries: { species?: PetSpecies; equipment?: Equipment; probability: number }[];
}
interface GachaResult {
  gachaId: number; balance: number; isDuplicate: boolean; isPity: boolean;
  pet?: Pet; equipment?: UserEquipment; refundCell?: number;
}
interface GachaLog { gachaId: number; poolId: number; species?: PetSpecies; equipment?: Equipment; createdAt: string; }

interface Stage {
  stageNo: number; displayId: string; worldNo: number; subNo: number; isBoss: boolean;
  name: string; bossName: string; briefing: string;
  clearBonusScore: number; firstClearRewardCell: number; repeatRewardCell: number;
  unlocked: boolean; cleared: boolean;
}
interface StageList { stages: Stage[]; endlessUnlocked: boolean; }
interface GameStartRequest { mode: "STAGE" | "ENDLESS"; stageNo?: number; userPetId: number; buffItemIds?: number[]; practice?: boolean; }
interface GameStart {
  runId: number | null; practice: boolean; mode: "STAGE" | "ENDLESS"; stageNo: number | null; stage: Stage | null;
  pet: Pet; combatStats: CombatStats; upgrades: StatUpgrade[]; appliedBuffs: Item[];
}
interface GameFinishRequest { survivalMs: number; killCount: number; reachedWave: number; cleared: boolean; reviveUsed: boolean; }
interface GameResult {
  runId: number; replayed: boolean; mode: "STAGE" | "ENDLESS"; stageNo: number | null;
  score: number; rewardCell: number; firstClearBonus: number; expGained: number; cleared: boolean;
  pet: Pet | null; balance: number; newRank: number | null;
}
interface GameRun {
  runId: number; mode: "STAGE" | "ENDLESS"; stageNo: number | null; displayId: string | null;
  status: "PLAYING" | "FINISHED" | "ABORTED";
  score: number; survivalMs: number; killCount: number; reachedWave: number; cleared: boolean;
  rewardCell: number; expGained: number; startedAt: string; endedAt: string | null;
}
interface RankingEntry { rank: number; userId: number; nickname: string; title: Title | null; bestScore: number; achievedAt: string; }
interface Ranking { weekStart: string; myRank: RankingEntry | null; entries: RankingEntry[]; }

interface Mail {
  mailId: number; sourceType: string; title: string; cellAmount: number; titleReward: Title | null;
  createdAt: string; claimedAt: string | null; expiresAt: string | null;
}
```

---

## 8. 담당·파일

| 담당 | 라우트 파일 | 서비스 파일 |
| --- | --- | --- |
| 🟦 창규 (공통) | auth.js, me.js, mails.js | cellService.js, petService.js, inventoryService.js, batch/dailyHunger.js, batch/weeklyRanking.js |
| 🟩 도로팜 (길·창규) | pets.js, shop.js, gacha.js, equipments.js, statUpgrades.js | gachaService.js, equipmentService.js |
| 🟥 미니게임 (석훈·기범) | stages.js, game.js, ranking.js | gameService.js (점수·검증·보상 계산) |

**진행 순서**
1. 🟦 공통 먼저: 스키마 → 인증 → 공통 서비스 함수 → `shared/types.ts`
2. 두 팀 동시 개발 (자기 라우트 파일만 건드림)
3. 상욱: 뽑기 → 돌봄 → 출전 → 보상 → 뽑기 순환 테스트
