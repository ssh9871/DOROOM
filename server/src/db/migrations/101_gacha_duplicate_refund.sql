-- 101: 중복 펫 환급 셀을 등급별로 + 펫 뽑기 천장 없음 (11/24, 11/26 창규 결정)
--  노말 30 / 레어 50 / 레전드 100  — 뽑기 1회 100셀 기준
--  기존 game_setting.DUPLICATE_REFUND_CELL(30, 전 등급 공통)은 더 이상 쓰지 않음
ALTER TABLE pet_grade_rule
  ADD COLUMN IF NOT EXISTS duplicate_refund_cell INT NOT NULL DEFAULT 30 CHECK (duplicate_refund_cell >= 0);

UPDATE pet_grade_rule SET duplicate_refund_cell = 30  WHERE grade = 'NORMAL';
UPDATE pet_grade_rule SET duplicate_refund_cell = 50  WHERE grade = 'RARE';
UPDATE pet_grade_rule SET duplicate_refund_cell = 100 WHERE grade = 'LEGEND';

-- 천장(30회째 레전드 확정) 없음. 순수 확률(85 / 12 / 3)로만 뽑음
UPDATE gacha_pool SET pity_count = NULL WHERE pool_type = 'PET';