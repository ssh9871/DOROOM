-- 🟩 시연 펫 4종 고유 능력 확정 (11/26 석훈): 강아지-체력 회복, 고양이-발사 속도 증가, 판다-보호막, 구미호-전체 탄막 제거 (창규)
UPDATE pet_species s SET innate_ability_id = a.ability_id
  FROM (VALUES ('dog', 'HEAL'), ('cat', 'RAPID_FIRE'), ('panda', 'SHIELD'), ('gumiho', 'BULLET_CLEAR')) AS v(code, ability_code)
  JOIN ability a ON a.code = v.ability_code
 WHERE s.code = v.code;
