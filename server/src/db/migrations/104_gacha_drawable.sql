-- 🟩 도감에는 24종을 다 보여주고, 실제로 뽑히는 건 시연용 4종(강아지·고양이·판다·구미호)만 (창규)
-- is_drawable = FALSE 인 후보는 도감·확률표에는 나오지만 뽑기 추첨에서는 빠진다.
ALTER TABLE gacha_pool_entry ADD COLUMN IF NOT EXISTS is_drawable BOOLEAN NOT NULL DEFAULT TRUE;

-- (예전 103 을 적용한 DB 를 위해) 빠진 펫 후보를 다시 채운다
INSERT INTO gacha_pool_entry (pool_id, species_id, weight)
SELECT p.pool_id, s.species_id, 1
  FROM gacha_pool p CROSS JOIN pet_species s
 WHERE p.pool_type = 'PET' AND s.is_active
   AND NOT EXISTS (SELECT 1 FROM gacha_pool_entry e WHERE e.pool_id = p.pool_id AND e.species_id = s.species_id);

UPDATE gacha_pool_entry e
   SET is_drawable = (s.code IN ('dog', 'cat', 'panda', 'gumiho'))
  FROM pet_species s
 WHERE s.species_id = e.species_id;
-- 나중에 24종을 다 뽑히게 하려면: UPDATE gacha_pool_entry SET is_drawable = TRUE;
