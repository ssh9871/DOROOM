-- 펫 뽑기: 도감 24종 전부 뽑히게 한다 (104 에서는 3D 모델이 있는 4종만 뽑혔음).
-- 3D 모델이 없는 펫은 마이룸·펫 정원에서 그림(PNG)을 세워서 보여준다.
-- 중복 방지는 서버 추첨(gachaService.drawOnce)에서: 펫 뽑기는 아직 없는 펫 중에서만 뽑는다.
UPDATE gacha_pool_entry e
   SET is_drawable = TRUE
  FROM gacha_pool p, pet_species s
 WHERE p.pool_id = e.pool_id AND p.pool_type = 'PET'
   AND s.species_id = e.species_id AND s.is_active;
