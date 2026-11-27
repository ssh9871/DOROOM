-- 100: 뽑기 확률을 "등급 단위"로 (11/23 창규 결정)
--  - 등급을 먼저 뽑고, 그 등급 안에서는 종(장비)을 똑같은 확률로 뽑는다
--  - 그래서 나중에 노말 펫을 22종으로 늘려도 85 / 12 / 3 은 그대로 유지됨
--  - gacha_pool_entry 는 "이 뽑기에 나오는 후보 목록"으로만 쓰고 weight 는 쓰지 않음

CREATE TABLE IF NOT EXISTS gacha_grade_rate (
    pool_id  INT         NOT NULL REFERENCES gacha_pool(pool_id) ON DELETE CASCADE,
    grade    VARCHAR(10) NOT NULL REFERENCES pet_grade_rule(grade),
    rate_bp  INT         NOT NULL CHECK (rate_bp BETWEEN 0 AND 10000),   -- 만분율: 8500 = 85%
    PRIMARY KEY (pool_id, grade)
);

-- 펫 뽑기: 노말 85% / 레어(거북이) 12% / 레전드(판다) 3%, 1회 100셀, 30회째 레전드 확정, 하루 10회
UPDATE gacha_pool SET cost_cell = 100, pity_count = 30, daily_limit = 10 WHERE pool_type = 'PET';
INSERT INTO gacha_grade_rate (pool_id, grade, rate_bp)
SELECT p.pool_id, v.grade, v.rate_bp
  FROM gacha_pool p, (VALUES ('NORMAL', 8500), ('RARE', 1200), ('LEGEND', 300)) AS v(grade, rate_bp)
 WHERE p.pool_type = 'PET'
ON CONFLICT (pool_id, grade) DO NOTHING;

-- 장비 뽑기: 기존 값 유지 (노말 90% / 레어 10%, 레전드는 합치기로만 얻음) [가정]
INSERT INTO gacha_grade_rate (pool_id, grade, rate_bp)
SELECT p.pool_id, v.grade, v.rate_bp
  FROM gacha_pool p, (VALUES ('NORMAL', 9000), ('RARE', 1000)) AS v(grade, rate_bp)
 WHERE p.pool_type = 'EQUIPMENT'
ON CONFLICT (pool_id, grade) DO NOTHING;

-- 중복 펫 환급: 30셀 (가격 100셀의 30%) — game_setting DUPLICATE_REFUND_CELL 그대로 사용
