# DOROOM 서버 개발 가이드

> 작성: 양창규. DB v2 + API 명세서 v1 기준으로 개발을 시작합니다. 읽는 데 5분.
> 관련 파일: `server/src/db/` (schema_v2.sql, seed_and_test_v2.sql, erd/) · `docs/db/` (API_명세서_v1.md, DB_v2_변경사항_및_확정필요목록.md)

---

## 1. 전원 공통

**꼭 지킬 것 4개**
1. **이름 규칙** — DB는 snake_case(`user_pet_id`), JSON은 camelCase(`userPetId`), 응답 객체 이름은 명세서 7장 DTO 그대로(`Pet`, `PetDetail`, `GameResult` …). 같은 걸 `petId` / `pet_id` / `userPetId`로 다르게 부르는 순간 합칠 때 다 고쳐야 함
2. **셀·경험치·펫 상태는 공통 함수로만** — `addCell`, `addPetExp`, `getPetCombatStats`, `assertPetCanSortie`, `addItem/useItem/addEquipment`. 각자 UPDATE 문 금지. 이걸 지키면 나중에 공식이 바뀌어도 자기 코드는 안 바뀜
3. **응답 형식 통일** — 성공 `{ok:true, data}`, 실패 `{ok:false, error:{code, message}}`. 에러 코드는 명세서 0-3 목록에서만
4. **userId는 토큰에서** — 클라이언트가 보낸 userId를 믿지 않음. 회원가입/로그인 API는 **개발용 임시**(도로버스 계정 연동 방식 확인 중)

**DB를 바꾸고 싶을 때**
- `schema_v2.sql` 직접 수정 금지. `server/src/db/migrations/00N_설명.sql`로 추가하고 PR. 다른 팀원은 "00N 실행해"로 따라감
- `app_user`, `user_pet`, `cell_transaction`, `game_run` 4개는 **두 팀이 같이 쓰는 테이블** → 컬럼 바꾸려면 양쪽 합의. 나머지는 담당 팀이 알아서
- `cell_transaction.reason`에 새 값(예: QUEST_REWARD, SKIN_PURCHASE)을 쓰려면 CHECK 제약을 먼저 고쳐야 함 → 창규에게

**깃허브**
- 저장소: 노션에 있는 `ssh9871/doroom` 그대로
- `main` 직접 push 금지, PR + 리뷰 1명 후 머지
- 브랜치 이름: `feat/dorofarm-pets`, `feat/minigame-game`, `feat/common-auth` (팀/기능)
- 작게 자주 머지. 한 브랜치에 2주 쌓지 말기

**순서**
1. 창규: 스키마 · 인증(임시) · 공통 서비스 함수 · `shared/types.ts` 먼저 (약 1주)
2. 두 팀 병렬 개발
3. 상욱: 뽑기 → 돌봄 → 출전 → 보상 → 뽑기 순환 테스트

---

## 2. 🟩 도로팜 팀 (길 · 창규)

**담당 API** — 명세서 2~4장 (펫 9개, 상점·뽑기 6개, 장비·강화 6개 = 21개)
**담당 파일** — routes: pets.js, shop.js, gacha.js, equipments.js, statUpgrades.js / services: gachaService.js, equipmentService.js
**담당 테이블** — pet_species, pet_grade_rule, pet_evolution_rule, ability, item, equipment, gacha_*, user_item, user_equipment, user_pet_equipment, user_stat_upgrade, stat_upgrade_rule, pet_exp_transfer, pet_interaction_log, title, user_title

**지금 임의값으로 들어가 있는 것 (개발하면서 바꿔도 됨, 바뀌면 창규에게)**
- 등급별 최대 레벨 30/40/50, 레벨업 경험치 = 레벨 × (100/150/200)
- 진화: NORMAL Lv.10·20 / RARE Lv.15·30 / LEGEND Lv.20·40, 3단계에서 부활 1회
- 전승: 같은 등급 100%, 상위 등급으로 50%
- 뽑기: 펫 100셀(하루 10회, 천장 30), 장비 60셀(하루 20회), 등급 확률 80/17/3
- 영구 스탯 강화: 계정 전체 적용, 5레벨, 셀 50→250

**시작 전에 결정 필요 (⚠️ 구조가 바뀜)**
- 장비 슬롯 해금 기준: 등급(현재) vs **진화 단계(추천)** vs 레벨
- 장비 합치기(3개+셀 → 다음 등급) 채택 여부 — 개별 강화(+1,+2) 방식은 테이블이 통째로 바뀌니 비추천

**주의**
- 뽑기는 **한 트랜잭션** (제한 확인 → 잔액 잠금·차감 → 추첨 → 기록 → 지급). 중간에 실패하면 전부 롤백
- 장착은 수량을 빼지 않음 (보유는 user_equipment, 장착은 user_pet_equipment 참조)
- 크로마 스킨은 결정되면 테이블 2개 + user_pet.skin_id 추가 예정. 지금은 없음

---

## 3. 🟥 미니게임 팀 (석훈 · 기범)

**담당 API** — 명세서 5장 (stages, game/start, game/:runId/finish, abort, history, ranking = 6개)
**담당 파일** — routes: stages.js, game.js, ranking.js / services: gameService.js
**담당 테이블** — stage, game_run, user_stage_clear, (뷰) v_weekly_ranking

**게임 시작 때 받는 것** — `POST /game/start` 응답의 `combatStats` (공격력·체력·이동속도·탄속·고유 능력·부활 가능 여부). 이게 펫 레벨+진화+장비+강화가 **이미 합산된 값**이라 게임은 이 숫자만 쓰면 됨. 계산 과정은 몰라도 됨

**게임 끝날 때 보내는 것** — `survivalMs, killCount, reachedWave, cleared, reviveUsed`. **점수는 보내지 않음** — 서버가 계산 (부정 방지)

**지금 임의값 (개발하면서 바꿔도 됨)**
- 점수 = 생존초×10 + 처치×5 + 클리어 보너스(100/200/400/800)
- 보상: 무한모드 셀 = 점수÷100, 경험치 = 점수÷10, 스테이지 첫 클리어 100~300셀
- 부정 판정: 생존 시간이 서버 기록 +5초 초과, 또는 초당 처치 20 초과면 거부
- 스테이지 해금: N−1 클리어하면 N 열림

**미니게임 팀이 정해서 창규에게 알려줄 것**
- **능력치 코드 목록** (현재 ATTACK / MAX_HP / MOVE_SPEED / BULLET_SPEED) — 게임에서 실제 쓰는 이름으로. 장비·강화 상점 데이터가 이 코드를 그대로 씀. 게임 중 뱀서식 레벨업 선택지는 DB와 무관
- 게임 버프 아이템(GAME_BUFF)의 효과 내용 → `item.effect_config` JSON에 뭘 담을지
- 부활 1회를 게임 안에서 어떻게 처리할지
- 퀘스트 넣을지, 넣으면 내용 — "펫 밥 주기" 같은 도로팜 행동이 조건이면 도로팜 팀과 맞추기

**주의**
- 랭킹은 **무한모드 · 정상 종료** 판만, 사람당 최고 점수 1개, 상위 10명 + 내 순위
- `finish`는 PLAYING 상태인 판에만 — 두 번 호출되면 ALREADY_FINISHED
- 셀·경험치 지급은 `addCell`, `addPetExp` 호출로. 직접 UPDATE 금지

---

## 4. 🧪 상욱 (테스트)

- pgAdmin에서 `schema_v2.sql` → `seed_and_test_v2.sql` 순서로 실행. 마지막에 `NOTICE: OK: 중복 보상 차단`이 뜨고 잔액 = 내역 합계면 정상
- 테스트 시나리오 기본 루프: 뽑기 → 밥 주기 → 출전 → 보상 수령 → 다시 뽑기
- 확인 포인트: 셀 잔액이 항상 `cell_transaction` 합계와 같은지 / 같은 판 보상이 두 번 안 들어가는지 / 배고픔 30 미만이면 출전 거부되는지 / 중복 펫 뽑으면 환급되는지
- 버그 제보 때 `run_id`, `user_id`, 시각을 같이 적어주면 로그 테이블로 추적 가능

---

## 5. 🎤 유민 (발표)

- ERD는 `erd/ERD_v2_1_발표용_전체관계도.png` (도메인별 색 구분), 상세는 `ERD_v2_2_상세.png`
- 설계 포인트 3개: ① 모든 셀 변동을 `cell_transaction` 원장에 기록 + 유니크 인덱스로 중복 보상 차단 ② 밸런스 수치는 코드가 아니라 규칙 테이블(`pet_grade_rule`, `stat_upgrade_rule` 등)에 ③ 랭킹은 저장 안 하고 뷰로 계산

---
