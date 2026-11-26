-- 🟩 장비 뽑기 3종 확정 (11/27 창규): 장갑(탄속)·투구(체력)·신발(이동 속도) × 노말·레어·레전드
--  - 신발은 발 슬롯(FEET) 새로 추가. 몸(BODY) 슬롯은 쓰지 않지만 남겨 둠
--  - 장비 뽑기에서는 노말·레어만 나오고 레전드는 합치기로만 얻음 (100 의 장비 확률 90/10 그대로)
DO $$
DECLARE c text;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
            WHERE conrelid = 'equipment'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%slot_type%'
  LOOP EXECUTE format('ALTER TABLE equipment DROP CONSTRAINT %I', c); END LOOP;
END $$;
ALTER TABLE equipment ADD CONSTRAINT equipment_slot_type_check CHECK (slot_type IN ('HEAD','BODY','ACCESSORY','FEET'));

INSERT INTO equipment (line_code, name, slot_type, grade, stat_code, stat_value, merge_count, merge_cell_cost) VALUES
  ('BOOTS', '신발', 'FEET', 'NORMAL', 'MOVE_SPEED', 10, 3, 50),
  ('BOOTS', '신발', 'FEET', 'RARE',   'MOVE_SPEED', 20, 3, 150),
  ('BOOTS', '신발', 'FEET', 'LEGEND', 'MOVE_SPEED', 35, NULL, 0)
ON CONFLICT (line_code, grade) DO NOTHING;
UPDATE equipment e SET next_equipment_id = n.equipment_id FROM equipment n
 WHERE e.line_code = 'BOOTS' AND n.line_code = 'BOOTS'
   AND ((e.grade = 'NORMAL' AND n.grade = 'RARE') OR (e.grade = 'RARE' AND n.grade = 'LEGEND'));

-- 이름에서 "(Normal)" 같은 꼬리 떼기 (등급은 화면에서 따로 보여줌)
UPDATE equipment SET name = CASE line_code WHEN 'GLOVE' THEN '장갑' WHEN 'HELMET' THEN '투구' ELSE name END
 WHERE line_code IN ('GLOVE', 'HELMET');

-- 장비 뽑기 후보: 3종의 노말·레어 (빠진 것만 추가)
INSERT INTO gacha_pool_entry (pool_id, equipment_id, weight)
SELECT p.pool_id, q.equipment_id, 1
  FROM gacha_pool p JOIN equipment q ON q.grade IN ('NORMAL', 'RARE') AND q.line_code IN ('GLOVE', 'HELMET', 'BOOTS') AND q.is_active
 WHERE p.pool_type = 'EQUIPMENT'
   AND NOT EXISTS (SELECT 1 FROM gacha_pool_entry e WHERE e.pool_id = p.pool_id AND e.equipment_id = q.equipment_id);

-- 레전드 장비는 도감에만 보이게 (뽑기 추첨에서는 빠짐, 합치기로만 얻음)
INSERT INTO gacha_pool_entry (pool_id, equipment_id, weight, is_drawable)
SELECT p.pool_id, q.equipment_id, 1, FALSE
  FROM gacha_pool p JOIN equipment q ON q.grade = 'LEGEND' AND q.line_code IN ('GLOVE', 'HELMET', 'BOOTS') AND q.is_active
 WHERE p.pool_type = 'EQUIPMENT'
   AND NOT EXISTS (SELECT 1 FROM gacha_pool_entry e WHERE e.pool_id = p.pool_id AND e.equipment_id = q.equipment_id);
