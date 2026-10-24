-- 핵심 흐름 검증용 샘플 데이터 + 트랜잭션 (값은 모두 임시)

INSERT INTO game_setting VALUES
 ('SORTIE_MIN_HUNGER','30','배고픔이 이 값 미만이면 출전 불가', now()),
 ('DAILY_HUNGER_DROP','20','전날 돌봄이 없으면 00시에 감소하는 배고픔', now()),
 ('DUPLICATE_REFUND_CELL','30','중복 펫 환급 셀', now());

INSERT INTO ability (code,name,effect_value,cooldown_sec) VALUES
 ('BULLET_CLEAR','맵 전체 탄막 제거',0,30),('HEAL','주기적 체력 회복',10,15),
 ('RAPID_FIRE','발사 속도 증가',1.5,20),('SHIELD','보호막',1,25);
INSERT INTO pet_species (name,grade,innate_ability_id) VALUES
 ('강아지','RARE',2),('거북이','UNIQUE',4),('드래곤','EPIC',1);
INSERT INTO evolution_rule VALUES (1,0,0,0,false),(2,100,50,1,false),(3,300,150,2,true);
INSERT INTO item (code,name,item_type,price_cell,hunger_restore,affection_restore,exp_gain) VALUES
 ('BASIC_FOOD','기본 사료','FOOD',10,30,0,0),('COOKIE','펫 쿠키','SNACK',20,10,10,20);
INSERT INTO stage (stage_no,name,clear_bonus_score,reward_cell) VALUES
 (1,'숲',100,10),(2,'바다',200,20),(3,'화산',400,40);
INSERT INTO gacha_pool (name,cost_cell,pity_count,daily_limit) VALUES ('기본 펫 뽑기',100,30,10);
INSERT INTO gacha_pool_entry VALUES (1,1,70),(1,2,25),(1,3,5);
INSERT INTO ranking_reward_tier (rank_from,rank_to,reward_cell) VALUES (1,1,300),(2,3,200),(4,10,100);
INSERT INTO app_user (login_id,password_hash,nickname,cell_balance) VALUES
 ('kim','x','별빛',0),('lee','x','달빛',0);
-- 시작 셀 지급(관리자)
UPDATE app_user SET cell_balance = 500 WHERE user_id IN (1,2);
INSERT INTO cell_transaction (user_id,amount,balance_after,reason) VALUES (1,500,500,'ADMIN'),(2,500,500,'ADMIN');

-- ① 펫 획득: 가챠 (결과 = 강아지, 신규)
BEGIN;
  SELECT cell_balance FROM app_user WHERE user_id=1 FOR UPDATE;        -- 잔액 잠금
  SELECT count(*) AS today FROM gacha_log WHERE user_id=1 AND pool_id=1 AND created_at >= date_trunc('day',now()); -- 하루 제한 확인
  UPDATE app_user SET cell_balance = cell_balance - 100 WHERE user_id=1;
  INSERT INTO gacha_log (user_id,pool_id,species_id,is_duplicate) VALUES (1,1,1,false);
  INSERT INTO cell_transaction (user_id,amount,balance_after,reason,ref_id)
    SELECT 1,-100,cell_balance,'GACHA',currval('gacha_log_gacha_id_seq') FROM app_user WHERE user_id=1;
  INSERT INTO user_pet (user_id,species_id,is_representative) VALUES (1,1,true);
COMMIT;

-- ①-2 같은 펫이 또 나옴 → 중복이면 셀 환급
BEGIN;
  UPDATE app_user SET cell_balance = cell_balance - 100 WHERE user_id=1;
  INSERT INTO gacha_log (user_id,pool_id,species_id,is_duplicate) VALUES (1,1,1,true);
  INSERT INTO cell_transaction (user_id,amount,balance_after,reason,ref_id)
    SELECT 1,-100,cell_balance,'GACHA',currval('gacha_log_gacha_id_seq') FROM app_user WHERE user_id=1;
  INSERT INTO user_pet (user_id,species_id) VALUES (1,1) ON CONFLICT (user_id,species_id) DO NOTHING;
  UPDATE app_user SET cell_balance = cell_balance + 30 WHERE user_id=1;
  INSERT INTO cell_transaction (user_id,amount,balance_after,reason,ref_id)
    SELECT 1,30,cell_balance,'DUPLICATE_REFUND',currval('gacha_log_gacha_id_seq') FROM app_user WHERE user_id=1;
COMMIT;

-- ② 아이템 구매 + 간식 주기 (배고픔↑, 경험치↑, 돌봄 시간 갱신)
BEGIN;
  UPDATE app_user SET cell_balance = cell_balance - 20 WHERE user_id=1;
  INSERT INTO cell_transaction (user_id,amount,balance_after,reason,ref_id)
    SELECT 1,-20,cell_balance,'ITEM_PURCHASE',2 FROM app_user WHERE user_id=1;
  INSERT INTO user_item VALUES (1,2,1) ON CONFLICT (user_id,item_id) DO UPDATE SET quantity = user_item.quantity + 1;
COMMIT;
BEGIN;
  UPDATE user_item SET quantity = quantity - 1 WHERE user_id=1 AND item_id=2;   -- 0 미만이면 CHECK 위반으로 실패
  UPDATE user_pet p SET hunger = LEAST(100, p.hunger + i.hunger_restore),
                        affection   = LEAST(100, p.affection + i.affection_restore),
                        exp    = p.exp + i.exp_gain, last_interacted_at = now()
    FROM item i WHERE p.user_pet_id=1 AND i.item_id=2;
  INSERT INTO pet_interaction_log (user_pet_id,interaction_type,item_id) VALUES (1,'FEED',2);
COMMIT;

-- ③ 출전 펫 선택 → 게임 시작 (배고픔 기준 확인)
SELECT p.user_pet_id, p.hunger >= s.setting_value::int AS can_sortie
FROM user_pet p, game_setting s WHERE p.user_id=1 AND s.setting_key='SORTIE_MIN_HUNGER';
INSERT INTO game_run (user_id,user_pet_id,species_id,pet_stage_snapshot,mode)
SELECT user_id,user_pet_id,species_id,evolution_stage,'ENDLESS' FROM user_pet WHERE user_pet_id=1;

-- ④ 게임 결과 저장 + 보상 지급 (한 트랜잭션, 중복 지급 방지)
BEGIN;
  UPDATE game_run SET status='FINISHED', ended_at=now(), reached_stage=3,
         survival_ms=185000, kill_count=120,
         stage_bonus_score=(SELECT sum(clear_bonus_score) FROM stage WHERE stage_no < 3),
         reward_cell=(SELECT sum(reward_cell) FROM stage WHERE stage_no < 3), exp_gained=90,
         week_start=date_trunc('week',now())::date
   WHERE run_id=1 AND status='PLAYING';                    -- PLAYING일 때만 → 두 번 종료 불가
  UPDATE game_run SET score = survival_ms/1000*10 + kill_count*5 + stage_bonus_score WHERE run_id=1;
  UPDATE app_user SET cell_balance = cell_balance + 30 WHERE user_id=1;
  INSERT INTO cell_transaction (user_id,amount,balance_after,reason,ref_id)
    SELECT 1,30,cell_balance,'GAME_REWARD',1 FROM app_user WHERE user_id=1;
  UPDATE user_pet SET exp = exp + 90 WHERE user_pet_id=1;
  INSERT INTO user_stage_clear (user_id,stage_no,first_run_id) VALUES (1,1,1),(1,2,1) ON CONFLICT DO NOTHING;
COMMIT;

-- ④-2 같은 판 보상 재요청 → 유니크 인덱스가 막아야 함
DO $$ BEGIN
  INSERT INTO cell_transaction (user_id,amount,balance_after,reason,ref_id) VALUES (1,30,999,'GAME_REWARD',1);
  RAISE EXCEPTION 'FAIL: 중복 보상이 들어감';
EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'OK: 중복 보상 차단됨';
END $$;

-- ⑤ 진화: 경험치 충족 + 셀 지불
BEGIN;
  SELECT p.exp, r.required_exp, r.evolve_cell_cost FROM user_pet p
    JOIN evolution_rule r ON r.evolution_stage = p.evolution_stage + 1 WHERE p.user_pet_id=1 FOR UPDATE OF p;
  UPDATE app_user SET cell_balance = cell_balance - 50 WHERE user_id=1;
  INSERT INTO cell_transaction (user_id,amount,balance_after,reason,ref_id)
    SELECT 1,-50,cell_balance,'EVOLVE',1 FROM app_user WHERE user_id=1;
  UPDATE user_pet SET evolution_stage = 2 WHERE user_pet_id=1 AND exp >= 100;
  INSERT INTO user_pet_ability (user_pet_id,slot_no,ability_id) VALUES (1,1,3); -- 2단계 → 1칸 장착
COMMIT;

-- ⑥ 00시 배치: 전날 돌봄 없으면 배고픔 감소 (같은 날 두 번 돌려도 1번만)
UPDATE user_pet SET last_interacted_at = now() - interval '2 days' WHERE user_pet_id=1;
UPDATE user_pet SET hunger = GREATEST(0, hunger - 20), state_checked_on = current_date
 WHERE last_interacted_at < date_trunc('day', now()) - interval '1 day'
   AND (state_checked_on IS NULL OR state_checked_on < current_date);
UPDATE user_pet SET hunger = GREATEST(0, hunger - 20), state_checked_on = current_date
 WHERE last_interacted_at < date_trunc('day', now()) - interval '1 day'
   AND (state_checked_on IS NULL OR state_checked_on < current_date);

-- ⑦ 주간 랭킹 마감 → 우편 발송 → 받기
INSERT INTO game_run (user_id,user_pet_id,species_id,pet_stage_snapshot,mode,status,score,week_start,ended_at)
VALUES (2,NULL,2,1,'ENDLESS','FINISHED',900,date_trunc('week',now())::date,now());
INSERT INTO weekly_ranking_result (week_start,user_id,rank_no,best_score,best_run_id)
SELECT week_start, user_id, RANK() OVER (ORDER BY best DESC), best, run_id FROM (
  SELECT DISTINCT ON (user_id) week_start, user_id, score AS best, run_id
  FROM game_run WHERE status='FINISHED' AND mode='ENDLESS' AND week_start=date_trunc('week',now())::date
  ORDER BY user_id, score DESC) t;
INSERT INTO reward_mail (user_id,source_type,source_key,title,cell_amount)
SELECT w.user_id,'RANKING','RANK:'||w.week_start, w.rank_no||'위 보상', t.reward_cell
FROM weekly_ranking_result w JOIN ranking_reward_tier t ON w.rank_no BETWEEN t.rank_from AND t.rank_to
WHERE w.week_start = date_trunc('week',now())::date
ON CONFLICT (user_id,source_type,source_key) DO NOTHING;     -- 배치 재실행해도 중복 발송 X
BEGIN;
  UPDATE reward_mail SET claimed_at = now() WHERE mail_id=1 AND claimed_at IS NULL;
  UPDATE app_user u SET cell_balance = u.cell_balance + m.cell_amount FROM reward_mail m WHERE m.mail_id=1 AND u.user_id=m.user_id;
  INSERT INTO cell_transaction (user_id,amount,balance_after,reason,ref_id)
    SELECT m.user_id, m.cell_amount, u.cell_balance,'MAIL_CLAIM',m.mail_id FROM reward_mail m JOIN app_user u USING(user_id) WHERE m.mail_id=1;
COMMIT;

-- 결과 확인
SELECT user_id, nickname, cell_balance,
       (SELECT sum(amount) FROM cell_transaction t WHERE t.user_id=u.user_id) AS ledger_sum
FROM app_user u ORDER BY user_id;
SELECT user_pet_id, evolution_stage, exp, hunger, affection, state_checked_on FROM user_pet;
SELECT run_id, user_id, score, reward_cell FROM game_run ORDER BY run_id;
SELECT * FROM weekly_ranking_result;
SELECT mail_id,user_id,title,cell_amount,claimed_at IS NOT NULL AS claimed FROM reward_mail;
