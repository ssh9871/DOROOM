-- 102: 펫 24종 (11/26 창규) — 노말 22 / 레어 판다 / 레전드 구미호
--  - 판다: LEGEND → RARE, 구미호 LEGEND 새로 추가, 여우는 없음
--  - 거북이: 사용 안 함 (is_active = false, 뽑기 후보에서 제거). 이미 가진 사람의 기록은 남겨둠
--  - code: 그림 파일 이름에 씀 → client/public/assets/pets/pet-{code}.png
--  - 고유 능력은 [임시] — 확정되면 innate_ability_id 만 바꾸면 됨
--    구미호 탄막 제거, 노말은 체력 회복 / 발사 속도 / 보호막을 돌아가며. 기존 강아지·고양이·판다 능력은 그대로

ALTER TABLE pet_species
  ADD COLUMN IF NOT EXISTS code      VARCHAR(30) UNIQUE,
  ADD COLUMN IF NOT EXISTS image_url VARCHAR(300);

-- 기존 4종
UPDATE pet_species SET code = 'dog',    image_url = '/assets/pets/pet-dog.png'   WHERE name = '강아지';
UPDATE pet_species SET code = 'cat',    image_url = '/assets/pets/pet-cat.png'   WHERE name = '고양이';
UPDATE pet_species SET code = 'panda',  image_url = '/assets/pets/pet-panda.png', grade = 'RARE' WHERE name = '판다';
UPDATE pet_species SET code = 'turtle', is_active = false WHERE name = '거북이';

-- 새 20종 (노말 19 + 구미호)
INSERT INTO pet_species (name, code, grade, innate_ability_id, image_url)
SELECT v.name, v.code, v.grade, a.ability_id, '/assets/pets/pet-' || v.code || '.png'
  FROM (VALUES
    ('꿀벌',   'bee',         'NORMAL', 'HEAL'),
    ('토끼',   'rabbit',      'NORMAL', 'RAPID_FIRE'),
    ('애벌레', 'caterpillar', 'NORMAL', 'SHIELD'),
    ('병아리', 'chick',       'NORMAL', 'HEAL'),
    ('소',     'cow',         'NORMAL', 'RAPID_FIRE'),
    ('물고기', 'fish',        'NORMAL', 'SHIELD'),
    ('펭귄',   'penguin',     'NORMAL', 'HEAL'),
    ('돼지',   'pig',         'NORMAL', 'RAPID_FIRE'),
    ('비버',   'beaver',      'NORMAL', 'SHIELD'),
    ('게',     'crab',        'NORMAL', 'HEAL'),
    ('멧돼지', 'boar',        'NORMAL', 'RAPID_FIRE'),
    ('코알라', 'koala',       'NORMAL', 'SHIELD'),
    ('원숭이', 'monkey',      'NORMAL', 'HEAL'),
    ('앵무새', 'parrot',      'NORMAL', 'RAPID_FIRE'),
    ('사슴',   'deer',        'NORMAL', 'SHIELD'),
    ('코끼리', 'elephant',    'NORMAL', 'HEAL'),
    ('기린',   'giraffe',     'NORMAL', 'RAPID_FIRE'),
    ('북극곰', 'polarbear',   'NORMAL', 'SHIELD'),
    ('사자',   'lion',        'NORMAL', 'HEAL'),
    ('호랑이', 'tiger',       'NORMAL', 'RAPID_FIRE'),
    ('구미호', 'gumiho',      'LEGEND', 'BULLET_CLEAR')
  ) AS v(name, code, grade, ability_code)
  JOIN ability a ON a.code = v.ability_code
ON CONFLICT (name) DO NOTHING;

-- 펫 뽑기 후보 = 활성 24종 (확률은 등급 단위라 weight 는 쓰지 않음, 1 고정)
DELETE FROM gacha_pool_entry e USING gacha_pool p, pet_species s
 WHERE e.pool_id = p.pool_id AND p.pool_type = 'PET' AND s.species_id = e.species_id AND NOT s.is_active;
INSERT INTO gacha_pool_entry (pool_id, species_id, weight)
SELECT p.pool_id, s.species_id, 1
  FROM gacha_pool p CROSS JOIN pet_species s
 WHERE p.pool_type = 'PET' AND s.is_active
   AND NOT EXISTS (SELECT 1 FROM gacha_pool_entry e WHERE e.pool_id = p.pool_id AND e.species_id = s.species_id);
