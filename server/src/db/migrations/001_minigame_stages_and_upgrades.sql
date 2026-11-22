-- 001: 미니게임 DB 연동 (11/14, 석훈 요청 반영)
--  1) 스탯 코드 정의 테이블 + 미니게임 전용 강화 4종
--  2) 스테이지 4개 → 12개 지점(1-1 ~ 4-3), 기존 기록 이관
--  3) 주간 랭킹 뷰: 동점 시 먼저 달성한 계정이 앞 / week_start 는 한국시간 월요일
-- 재실행 안전: dbInit.js 가 schema_migration 테이블로 1회만 적용

-- ────────────────────────────────────────────────
-- 1. 스탯 코드 정의 (단위·설명). stat_upgrade_rule.value_bonus 는 "그 단계까지의 누적 효과"
-- ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stat_code (
    stat_code   VARCHAR(20) PRIMARY KEY,
    name        VARCHAR(50) NOT NULL,
    unit        VARCHAR(10) NOT NULL CHECK (unit IN ('FLAT','PERCENT')),  -- FLAT: 수치 그대로 더함 / PERCENT: 기본값의 %
    scope       VARCHAR(10) NOT NULL CHECK (scope IN ('PET','MINIGAME')), -- PET: 펫 전투 능력치에 합산 / MINIGAME: 게임 내부에서 적용
    description VARCHAR(200)
);

INSERT INTO stat_code (stat_code, name, unit, scope, description) VALUES
  ('ATTACK',           '공격력',       'FLAT',    'PET',      '펫 기본 공격력에 더함'),
  ('MAX_HP',           '최대 체력',    'FLAT',    'PET',      '펫 기본 체력에 더함'),
  ('MOVE_SPEED',       '이동 속도',    'FLAT',    'PET',      '펫 이동 속도에 더함'),
  ('BULLET_SPEED',     '탄속',         'FLAT',    'PET',      '펫 탄속에 더함'),
  ('PROJECTILE_COUNT', '발사체 개수',  'FLAT',    'MINIGAME', '단계당 +1발'),
  ('DAMAGE',           '피해량',       'PERCENT', 'MINIGAME', '단계당 기본 피해량의 +10%'),
  ('PROJECTILE_SIZE',  '발사체 크기',  'PERCENT', 'MINIGAME', '단계당 기본 크기의 +10%'),
  ('HP',               '체력',         'FLAT',    'MINIGAME', '단계당 +1 HP')
ON CONFLICT (stat_code) DO NOTHING;

-- 미니게임 전용 강화 규칙 (석훈 표 그대로). value_bonus = 누적 효과
INSERT INTO stat_upgrade_rule (stat_code, level, cell_cost, value_bonus) VALUES
  ('PROJECTILE_COUNT', 1, 120, 1), ('PROJECTILE_COUNT', 2, 300, 2),
  ('DAMAGE', 1,  60, 10), ('DAMAGE', 2, 100, 20), ('DAMAGE', 3, 150, 30), ('DAMAGE', 4, 220, 40), ('DAMAGE', 5, 320, 50),
  ('PROJECTILE_SIZE', 1, 50, 10), ('PROJECTILE_SIZE', 2, 80, 20), ('PROJECTILE_SIZE', 3, 120, 30), ('PROJECTILE_SIZE', 4, 180, 40), ('PROJECTILE_SIZE', 5, 260, 50),
  ('HP', 1, 80, 1), ('HP', 2, 150, 2), ('HP', 3, 280, 3)
ON CONFLICT (stat_code, level) DO NOTHING;

-- 규칙 테이블이 코드 정의를 참조하도록 (기존 코드는 위에서 전부 등록됨)
ALTER TABLE stat_upgrade_rule
  ADD CONSTRAINT fk_stat_upgrade_rule_code FOREIGN KEY (stat_code) REFERENCES stat_code(stat_code);

-- ────────────────────────────────────────────────
-- 2. 스테이지 12개 지점
--    표시 ID "w-s"  ↔  stage_no = (w-1)*3 + s   (1-1=1, 1-2=2, 1-3=3, 2-1=4 … 4-3=12)
--    기존 작전 k(1~4)의 기록은 그 작전의 마지막 지점(k-3)으로 이관 → "작전 k 클리어" 의미 유지
-- ────────────────────────────────────────────────
ALTER TABLE stage
  ADD COLUMN IF NOT EXISTS world_no   SMALLINT,
  ADD COLUMN IF NOT EXISTS sub_no     SMALLINT,
  ADD COLUMN IF NOT EXISTS display_id VARCHAR(5),
  ADD COLUMN IF NOT EXISTS is_boss    BOOLEAN NOT NULL DEFAULT false;

-- 2-1. 없는 지점 행 생성 (seed 없이 schema만 올린 DB도 12개가 되도록 1~12 전부, 있는 건 건너뜀)
INSERT INTO stage (stage_no, name, boss_name, briefing, clear_bonus_score, first_clear_reward_cell, repeat_reward_cell)
SELECT n, 'tmp', '', '', 0, 0, 0 FROM generate_series(1, 12) n
ON CONFLICT (stage_no) DO NOTHING;

-- 2-2. 기존 기록 이관: 작전 k → 지점 k-3 (stage_no 3,6,9,12). 역순으로 해야 겹치지 않음
UPDATE game_run         SET stage_no = 12 WHERE stage_no = 4;
UPDATE user_stage_clear SET stage_no = 12 WHERE stage_no = 4 AND NOT EXISTS (SELECT 1 FROM user_stage_clear u2 WHERE u2.user_id = user_stage_clear.user_id AND u2.stage_no = 12);
UPDATE game_run         SET stage_no = 9  WHERE stage_no = 3;
UPDATE user_stage_clear SET stage_no = 9  WHERE stage_no = 3 AND NOT EXISTS (SELECT 1 FROM user_stage_clear u2 WHERE u2.user_id = user_stage_clear.user_id AND u2.stage_no = 9);
UPDATE game_run         SET stage_no = 6  WHERE stage_no = 2;
UPDATE user_stage_clear SET stage_no = 6  WHERE stage_no = 2 AND NOT EXISTS (SELECT 1 FROM user_stage_clear u2 WHERE u2.user_id = user_stage_clear.user_id AND u2.stage_no = 6);
UPDATE game_run         SET stage_no = 3  WHERE stage_no = 1;
UPDATE user_stage_clear SET stage_no = 3  WHERE stage_no = 1 AND NOT EXISTS (SELECT 1 FROM user_stage_clear u2 WHERE u2.user_id = user_stage_clear.user_id AND u2.stage_no = 3);
-- (작전 1 클리어 기록은 1-1, 1-2 도 클리어한 것으로 간주 → 해금 흐름이 끊기지 않게 앞 지점도 채움)
INSERT INTO user_stage_clear (user_id, stage_no, first_run_id, first_cleared_at)
SELECT c.user_id, g.n, c.first_run_id, c.first_cleared_at
  FROM user_stage_clear c
  JOIN LATERAL generate_series(1, c.stage_no - 1) g(n) ON true
 WHERE c.stage_no IN (3, 6, 9, 12)
ON CONFLICT (user_id, stage_no) DO NOTHING;

-- 2-3. 12개 지점 내용 일괄 갱신  [가정] 가산점·보상은 아래 표, 석훈 팀이 조정
--   작전 w 의 이름·보스·브리핑은 기존 4개 그대로, 지점은 "작전명 w-s"
WITH world AS (
  SELECT * FROM (VALUES
    (1, '낯선 순찰',        '순찰 대장',        '펫이 바라보는 쪽을 봐. 같은 길을 계속 돌고 있어!'),
    (2, '어긋난 숲의 박자', '급수 관리기',      '숲이 변한 게 아니야. 관리 기계들의 순서가 어긋났어.'),
    (3, '되풀이되는 명령',  '운반 크레인',      '같은 기계를 계속 고칠 순 없어. 명령을 보내는 쪽을 멈추자.'),
    (4, '마지막 동기화',    '중앙 동기화 장치', '혼자 막으려 하지 마. 네 펫이 옆에 있잖아!')
  ) AS t(w, name, boss, briefing)
), pts AS (
  SELECT (w.w - 1) * 3 + s AS stage_no, w.w, s, w.name, w.boss, w.briefing, (s = 3) AS is_boss
    FROM world w CROSS JOIN generate_series(1, 3) s
)
UPDATE stage st SET
  world_no   = p.w,
  sub_no     = p.s,
  display_id = p.w || '-' || p.s,
  is_boss    = p.is_boss,
  name       = p.name || ' ' || p.w || '-' || p.s,
  boss_name  = CASE WHEN p.is_boss THEN p.boss ELSE '' END,
  briefing   = CASE WHEN p.s = 1 THEN p.briefing ELSE '' END,
  clear_bonus_score       = (p.w - 1) * 150 + p.s * 50 + CASE WHEN p.is_boss THEN 100 ELSE 0 END,  -- 1-1 50 … 4-3 700
  first_clear_reward_cell = p.w * 30 + p.s * 10 + CASE WHEN p.is_boss THEN 50 ELSE 0 END,           -- 1-1 40 … 4-3 200
  repeat_reward_cell      = p.w * 5 + p.s * 2                                                        -- 1-1 7 … 4-3 26
FROM pts p WHERE st.stage_no = p.stage_no;

ALTER TABLE stage
  ALTER COLUMN world_no SET NOT NULL,
  ALTER COLUMN sub_no SET NOT NULL,
  ALTER COLUMN display_id SET NOT NULL,
  ADD CONSTRAINT uq_stage_display UNIQUE (display_id),
  ADD CONSTRAINT ck_stage_pos CHECK (world_no BETWEEN 1 AND 4 AND sub_no BETWEEN 1 AND 3);

-- ────────────────────────────────────────────────
-- 3. 주간 랭킹 뷰: 동점이면 최고 점수를 먼저 달성한 계정이 위
--    week_start 는 서버가 종료 시각의 한국시간 월요일로 저장 (gameService 참고)
-- ────────────────────────────────────────────────
DROP VIEW IF EXISTS v_weekly_ranking;
CREATE VIEW v_weekly_ranking AS
WITH best AS (
  SELECT week_start, user_id, MAX(score) AS best_score
    FROM game_run
   WHERE status = 'FINISHED' AND mode = 'ENDLESS' AND week_start IS NOT NULL
   GROUP BY week_start, user_id
), achieved AS (
  SELECT b.week_start, b.user_id, b.best_score, MIN(g.ended_at) AS achieved_at
    FROM best b
    JOIN game_run g ON g.user_id = b.user_id AND g.week_start = b.week_start
                   AND g.status = 'FINISHED' AND g.mode = 'ENDLESS' AND g.score = b.best_score
   GROUP BY b.week_start, b.user_id, b.best_score
)
SELECT week_start, user_id, best_score, achieved_at,
       RANK() OVER (PARTITION BY week_start ORDER BY best_score DESC, achieved_at ASC) AS rank_no
  FROM achieved;

-- 게임 보상 reason 추가분은 없음 (GAME_REWARD / STAGE_FIRST_CLEAR 기존 값 사용)
