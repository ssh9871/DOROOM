# DOROOM DB v2 변경 요약 (v1 → v2)

> 기준: 11/12 팀장님 최종 답변 + 팀 결정. 26개 테이블 + 뷰 1개. `schema_v2.sql` / `seed_and_test_v2.sql`은 PostgreSQL 16에서 전부 실행·검증 완료.
> 함께 보는 파일: `API_명세서_v1.md`, `erd/ERD_v2_1_발표용_전체관계도.png`, `erd/ERD_v2_2_상세.png`

## 1. 빠진 테이블 (간소화)

| v1 테이블 | 빠진 이유 |
| --- | --- |
| user_pet_ability | 능력 슬롯 장착 → 장비 슬롯으로 대체 (펫 고유 능력은 pet_species.innate_ability_id 하나로) |
| weekly_ranking_result, ranking_reward_tier | 랭킹은 game_run에서 뷰(v_weekly_ranking)로 바로 계산. 보상은 1위 칭호만 → 티어 테이블 불필요 |
| pet_skin, user_pet_skin | 스킨 제외 결정 |
| farm, decoration, farm_object, farm_visit_log | 농장 제외 (도로팜 = 펫 돌봄 화면) |
| quest, user_quest | 퀘스트 미정 → 결정되면 추가 |
| evolution_rule | pet_evolution_rule로 재설계 (등급별 요구 레벨·셀 비용) |

## 2. 새로 들어간 테이블

| 테이블 | 내용 |
| --- | --- |
| pet_grade_rule | NORMAL/RARE/LEGEND 등급별 최대 레벨·레벨업 경험치·장비 슬롯 수·전승 비율 |
| pet_evolution_rule | 등급별 진화 단계(1→2→3)의 요구 레벨·셀 비용·부활 능력 부여 여부 |
| equipment | 장비 도감. 같은 계열(line_code)이 NORMAL→RARE→LEGEND로 이어짐 (next_equipment_id, merge_count) |
| user_equipment | 보유 장비 (수량) |
| user_pet_equipment | 펫 장비 슬롯 (slot_no 1~3) |
| stat_upgrade_rule, user_stat_upgrade | 쿠키런식 영구 스탯 강화 (레벨별 셀 비용·보너스) |
| pet_exp_transfer | 경험치 전승 기록 |
| title, user_title | 칭호 (랭킹 1위 보상) |
| gacha_pool.pool_type | 펫 뽑기 / 장비 뽑기 구분 |

## 3. 바뀐 테이블

| 테이블 | 변경 |
| --- | --- |
| pet_species | grade 컬럼 → pet_grade_rule FK, innate_ability_id 추가 |
| user_pet | evolution_stage 추가, 능력 슬롯 제거, is_representative 추가 |
| item | item_type에 EXP_POTION / EVOLVE_STONE / GAME_BUFF 추가, exp_gain·effect_config(JSONB) 추가 |
| cell_transaction.reason | STAGE_FIRST_CLEAR, EQUIP_GACHA, EVOLVE, EQUIP_MERGE, STAT_UPGRADE, RANK_REWARD 추가 |
| game_run | mode(STAGE/ENDLESS), stage_no, applied_buffs, revive_used, pet_stage_snapshot, week_start 추가 |
| reward_mail | title_id 추가 (칭호 보상) |
| app_user | equipped_title_id 추가 |
| stage | boss_name, briefing, first_clear_reward_cell / repeat_reward_cell 분리 |

## 4. 내가 임의로 정한 값 [가정] — 팀 확인 필요

테이블 구조가 아니라 **seed 값**이라 나중에 바꿔도 스키마는 안 바뀜.

| 항목 | 가정값 | 어디 |
| --- | --- | --- |
| 등급별 최대 레벨 | NORMAL 30 / RARE 40 / LEGEND 50 | pet_grade_rule |
| 장비 슬롯 해금 | 등급으로 해금: NORMAL 1칸 / RARE 2칸 / LEGEND 3칸 | pet_grade_rule.equip_slot_count |
| 슬롯 종류 | 1=HEAD, 2=BODY, 3=ACCESSORY 고정 | equipment.slot_type |
| 진화 요구 레벨 | NORMAL 10→20 / RARE 15→30 / LEGEND 20→40 (셀 50~200), 3단계에서 부활 능력 | pet_evolution_rule |
| 전승 비율 | 같은 등급 100%, 상위 등급으로 50% (하위로는 불가) | pet_grade_rule.transfer_ratio |
| 장비 등급 진화 | 같은 장비 3개 + 셀 → 다음 등급 1개 | equipment.merge_count |
| 스탯 종류 | ATTACK / MAX_HP / MOVE_SPEED / BULLET_SPEED, 각 5레벨 | stat_upgrade_rule |
| 점수 공식 | 생존초×10 + 처치×5 + 클리어 보너스 | API 명세 5장 |
| 보상 | 무한모드 셀 = 점수/100, 경험치 = 점수/10, 스테이지는 stage 테이블 값 | API 명세 5장 |
| 출전 조건 | 배고픔 ≥ 30, 돌봄 없으면 00시에 20 감소 | game_setting |
| 뽑기 | 펫 100셀·천장 30회·하루 10회, 장비 60셀·하루 20회, 중복 펫 환급 30셀 | gacha_pool, game_setting |
| 주간 랭킹 셀 보상 | 1위 300 / 2~3위 200 / 4~10위 100 (+1위 칭호) | game_setting |

## 5. 아직 팀이 정해야 하는 것

1. **장비 슬롯 해금 기준** — 등급(가정)인지, 진화 단계인지, 레벨인지. 바뀌면 `equip_slot_count` 위치만 옮기면 됨.
2. **장비 등급 진화 채택 여부** — 팀장님께 건의한 상태. 안 하면 `next_equipment_id`, `merge_count`, `/equipments/merge`만 빼면 됨.
3. **스탯 강화 목록** — 4종(가정) 확정 또는 변경. 미니게임 팀이 실제 쓰는 능력치와 맞춰야 함.
4. **점수·보상 공식** — 미니게임 팀이 게임 밸런스 보고 결정. 서버 gameService 한 곳만 수정.
5. **퀘스트** — 넣으면 quest / user_quest 2개 추가 (v1 설계 그대로 쓰면 됨).
6. **랭킹 마감 요일** — 월 00:00 가정. 일요일 밤이면 week_start 계산만 변경.

## 6. 적용 순서 (제안)

1. GitHub `server/src/db`에 `schema_v2.sql`, `seed_and_test_v2.sql`, `erd/` 올리기 (v1은 `legacy/`로)
2. 노션 "DB 설계" 페이지에 ERD v2 그림 + 이 변경요약 붙이기
3. 두 팀 모두 `API_명세서_v1.md` 읽고 자기 담당 파일부터 시작
4. 상욱님: pgAdmin에서 `schema_v2.sql` → `seed_and_test_v2.sql` 순서로 실행해 보고 결과 확인
