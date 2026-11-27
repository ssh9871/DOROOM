-- 🟩 장비를 펫한테 어울리게 (11/27 창규): 투구 → 모자, 장갑 → 목걸이. 능력치·칸·line_code 는 그대로 (HELMET, GLOVE).
UPDATE equipment SET name = CASE line_code WHEN 'HELMET' THEN '모자' WHEN 'GLOVE' THEN '목걸이' ELSE name END
 WHERE line_code IN ('HELMET', 'GLOVE');
