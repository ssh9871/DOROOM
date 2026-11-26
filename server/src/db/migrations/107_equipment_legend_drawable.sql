-- 🟩 장비 레전드도 뽑기에서 나오게 (11/27 창규): 확률을 펫과 같게 노말 85% / 레어 12% / 레전드 3%
UPDATE gacha_pool_entry e SET is_drawable = TRUE
  FROM gacha_pool p, equipment q
 WHERE e.pool_id = p.pool_id AND p.pool_type = 'EQUIPMENT' AND q.equipment_id = e.equipment_id;
INSERT INTO gacha_grade_rate (pool_id, grade, rate_bp)
SELECT p.pool_id, v.grade, v.rate_bp
  FROM gacha_pool p, (VALUES ('NORMAL', 8500), ('RARE', 1200), ('LEGEND', 300)) AS v(grade, rate_bp)
 WHERE p.pool_type = 'EQUIPMENT'
ON CONFLICT (pool_id, grade) DO UPDATE SET rate_bp = EXCLUDED.rate_bp;
