-- 003: 스테이지·무한 모드 입장 버프 3종 (11/26, 석훈 변경 요청 반영)
--  - 무적: 기존 BUFF_INVINCIBLE 의 item_id 그대로, 5초 → 30초
--  - 경험치 증가 / 셀 증가: GAME_BUFF 2종 추가
--  - 효과는 effect_config 로 표현. gameService 가 type 으로 읽음
--    INVINCIBLE {sec} / EXP_BOOST {percent} / CELL_BOOST {percent}
--  가격 3종 모두 150셀 (11/26 석훈 확정), 증가율 50%

UPDATE item
   SET name = '시작 무적 30초', price_cell = 150, effect_config = '{"type":"INVINCIBLE","sec":30}'
 WHERE code = 'BUFF_INVINCIBLE';

INSERT INTO item (code, name, item_type, price_cell, effect_config) VALUES
  ('BUFF_EXP_BOOST',  '경험치 부스터', 'GAME_BUFF', 150, '{"type":"EXP_BOOST","percent":50}'),
  ('BUFF_CELL_BOOST', '셀 부스터',     'GAME_BUFF', 150, '{"type":"CELL_BOOST","percent":50}')
ON CONFLICT (code) DO NOTHING;
