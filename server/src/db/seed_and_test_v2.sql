-- v2 샘플 데이터 + 핵심 흐름 검증 (값은 전부 [가정])
INSERT INTO game_setting VALUES
 ('SORTIE_MIN_HUNGER','30','배고픔 미만이면 출전 불가',now()),
 ('DAILY_HUNGER_DROP','20','전날 돌봄 없으면 00시 감소량',now()),
 ('DUPLICATE_REFUND_CELL','30','중복 펫 환급 셀',now()),
 ('RANK_REWARD_TOP1','300','주간 1위 셀',now()),
 ('RANK_REWARD_TOP3','200','주간 2~3위 셀',now()),
 ('RANK_REWARD_TOP10','100','주간 4~10위 셀',now());

INSERT INTO ability (code,name,effect_value,cooldown_sec) VALUES
 ('BULLET_CLEAR','맵 전체 탄막 제거',0,30),('HEAL','주기적 체력 회복',10,15),
 ('RAPID_FIRE','발사 속도 증가',1.5,20),('SHIELD','보호막',1,25);

-- 등급 규칙 [가정]: Normal 만렙30·슬롯1, Rare 만렙40·슬롯2, Legend 만렙50·슬롯3
INSERT INTO pet_grade_rule VALUES
 ('NORMAL',1,30,100,1,1.00),('RARE',2,40,150,2,0.50),('LEGEND',3,50,200,3,0.50);
-- 진화 규칙 [가정]: 2단계·3단계 진화 레벨
INSERT INTO pet_evolution_rule VALUES
 ('NORMAL',1,1,0,false),('NORMAL',2,10,50,false),('NORMAL',3,20,100,true),
 ('RARE',1,1,0,false),('RARE',2,15,80,false),('RARE',3,30,150,true),
 ('LEGEND',1,1,0,false),('LEGEND',2,20,120,false),('LEGEND',3,40,200,true);

INSERT INTO pet_species (name,grade,innate_ability_id) VALUES
 ('강아지','NORMAL',2),('고양이','NORMAL',3),('거북이','RARE',4),('판다','LEGEND',1);

INSERT INTO item (code,name,item_type,price_cell,hunger_restore,affection_restore,exp_gain,effect_config) VALUES
 ('BASIC_FOOD','기본 사료','FOOD',10,30,0,0,'{}'),
 ('COOKIE','펫 쿠키','SNACK',20,10,10,0,'{}'),
 ('BALL','공','TOY',30,0,20,0,'{}'),
 ('EXP_POTION_S','경험치 포션(소)','EXP_POTION',50,0,0,200,'{}'),
 ('EVOLVE_STONE','진화석','EVOLVE_STONE',100,0,0,0,'{}'),
 ('BUFF_INVINCIBLE','시작 무적 5초','GAME_BUFF',40,0,0,0,'{"type":"INVINCIBLE","sec":5}');

-- 장비 [가정]: 장갑 3등급 (탄속), 투구 3등급 (체력)
INSERT INTO equipment (line_code,name,slot_type,grade,stat_code,stat_value,merge_count,merge_cell_cost) VALUES
 ('GLOVE','장갑 (Normal)','ACCESSORY','NORMAL','BULLET_SPEED',10,3,50),
 ('GLOVE','장갑 (Rare)','ACCESSORY','RARE','BULLET_SPEED',20,3,150),
 ('GLOVE','장갑 (Legend)','ACCESSORY','LEGEND','BULLET_SPEED',35,NULL,0),
 ('HELMET','투구 (Normal)','HEAD','NORMAL','MAX_HP',10,3,50),
 ('HELMET','투구 (Rare)','HEAD','RARE','MAX_HP',20,3,150),
 ('HELMET','투구 (Legend)','HEAD','LEGEND','MAX_HP',35,NULL,0);
UPDATE equipment e SET next_equipment_id = n.equipment_id FROM equipment n
 WHERE e.line_code=n.line_code AND ((e.grade='NORMAL' AND n.grade='RARE') OR (e.grade='RARE' AND n.grade='LEGEND'));

-- 스탯 강화 [가정]: 4스탯 × 5레벨
INSERT INTO stat_upgrade_rule
SELECT s, l, 50*l, 5*l FROM unnest(ARRAY['ATTACK','MAX_HP','MOVE_SPEED','BULLET_SPEED']) s, generate_series(1,5) l;

INSERT INTO stage (stage_no,name,boss_name,briefing,clear_bonus_score,first_clear_reward_cell,repeat_reward_cell) VALUES
 (1,'낯선 순찰','순찰 대장','펫이 바라보는 쪽을 봐. 같은 길을 계속 돌고 있어!',100,100,10),
 (2,'어긋난 숲의 박자','급수 관리기','숲이 변한 게 아니야. 관리 기계들의 순서가 어긋났어.',200,150,20),
 (3,'되풀이되는 명령','운반 크레인','같은 기계를 계속 고칠 순 없어. 명령을 보내는 쪽을 멈추자.',400,200,30),
 (4,'마지막 동기화','중앙 동기화 장치','혼자 막으려 하지 마. 네 펫이 옆에 있잖아!',800,300,40);

INSERT INTO gacha_pool (pool_type,name,cost_cell,pity_count,daily_limit) VALUES
 ('PET','펫 뽑기',100,30,10),('EQUIPMENT','장비 뽑기',60,NULL,20);
INSERT INTO gacha_pool_entry (pool_id,species_id,weight) VALUES (1,1,40),(1,2,40),(1,3,17),(1,4,3);
INSERT INTO gacha_pool_entry (pool_id,equipment_id,weight) VALUES (2,1,45),(2,4,45),(2,2,5),(2,5,5);

INSERT INTO title (code,name,condition_desc) VALUES
 ('WEEKLY_TOP1','이번 주 정화 1위','주간 랭킹 1위'),('OP4_CLEAR','마지막 동기화 완수','작전 4 클리어');

INSERT INTO app_user (login_id,password_hash,nickname,cell_balance) VALUES ('kim','x','별빛',1000),('lee','x','달빛',1000);
INSERT INTO cell_transaction (user_id,amount,balance_after,reason) VALUES (1,1000,1000,'ADMIN'),(2,1000,1000,'ADMIN');

-- ① 펫 뽑기 (고양이 NORMAL)
BEGIN;
  SELECT cell_balance FROM app_user WHERE user_id=1 FOR UPDATE;
  UPDATE app_user SET cell_balance=cell_balance-100 WHERE user_id=1;
  INSERT INTO gacha_log (user_id,pool_id,species_id) VALUES (1,1,2);
  INSERT INTO cell_transaction (user_id,amount,balance_after,reason,ref_id)
    SELECT 1,-100,cell_balance,'PET_GACHA',currval('gacha_log_gacha_id_seq') FROM app_user WHERE user_id=1;
  INSERT INTO user_pet (user_id,species_id,is_representative) VALUES (1,2,true);
COMMIT;
-- ①-2 장비 뽑기 ×3 (장갑 Normal)
BEGIN;
  UPDATE app_user SET cell_balance=cell_balance-180 WHERE user_id=1;
  INSERT INTO gacha_log (user_id,pool_id,equipment_id) VALUES (1,2,1),(1,2,1),(1,2,1);
  INSERT INTO cell_transaction (user_id,amount,balance_after,reason,ref_id)
    SELECT 1,-180,cell_balance,'EQUIP_GACHA',currval('gacha_log_gacha_id_seq') FROM app_user WHERE user_id=1;
  INSERT INTO user_equipment VALUES (1,1,3) ON CONFLICT (user_id,equipment_id) DO UPDATE SET quantity=user_equipment.quantity+3;
COMMIT;

-- ② 장비 합치기: 장갑 Normal 3개 → Rare 1개
BEGIN;
  UPDATE user_equipment SET quantity=quantity-3 WHERE user_id=1 AND equipment_id=1;  -- 부족하면 CHECK 실패
  UPDATE app_user SET cell_balance=cell_balance-50 WHERE user_id=1;
  INSERT INTO cell_transaction (user_id,amount,balance_after,reason,ref_id) SELECT 1,-50,cell_balance,'EQUIP_MERGE',1 FROM app_user WHERE user_id=1;
  INSERT INTO user_equipment VALUES (1,2,1) ON CONFLICT (user_id,equipment_id) DO UPDATE SET quantity=user_equipment.quantity+1;
COMMIT;
-- ②-2 장착 (NORMAL 펫 = 슬롯 1칸, 서버가 pet_grade_rule.equip_slot_count로 검사)
INSERT INTO user_pet_equipment (user_pet_id,slot_no,equipment_id) VALUES (1,1,2);

-- ③ 스탯 강화 ATTACK 0→1
BEGIN;
  UPDATE app_user SET cell_balance=cell_balance-50 WHERE user_id=1;
  INSERT INTO cell_transaction (user_id,amount,balance_after,reason) SELECT 1,-50,cell_balance,'STAT_UPGRADE' FROM app_user WHERE user_id=1;
  INSERT INTO user_stat_upgrade VALUES (1,'ATTACK',1) ON CONFLICT (user_id,stat_code) DO UPDATE SET level=user_stat_upgrade.level+1;
COMMIT;

-- ④ 게임 시작 → 종료 (스테이지 1 클리어)
INSERT INTO game_run (user_id,user_pet_id,species_id,pet_level_snapshot,pet_stage_snapshot,mode,stage_no)
SELECT user_id,user_pet_id,species_id,level,evolution_stage,'STAGE',1 FROM user_pet WHERE user_pet_id=1;
BEGIN;
  UPDATE game_run SET status='FINISHED',ended_at=now(),cleared=true,reached_wave=5,survival_ms=120000,kill_count=80,
         score=120000/1000*10+80*5+100, reward_cell=100+10, exp_gained=150, week_start=date_trunc('week',now())::date
   WHERE run_id=1 AND status='PLAYING';
  UPDATE app_user SET cell_balance=cell_balance+10 WHERE user_id=1;
  INSERT INTO cell_transaction (user_id,amount,balance_after,reason,ref_id) SELECT 1,10,cell_balance,'GAME_REWARD',1 FROM app_user WHERE user_id=1;
  INSERT INTO user_stage_clear (user_id,stage_no,first_run_id) VALUES (1,1,1) ON CONFLICT DO NOTHING;
  UPDATE app_user SET cell_balance=cell_balance+100 WHERE user_id=1;
  INSERT INTO cell_transaction (user_id,amount,balance_after,reason,ref_id) SELECT 1,100,cell_balance,'STAGE_FIRST_CLEAR',1 FROM app_user WHERE user_id=1;
  -- 경험치 +150 → 레벨업 계산 (NORMAL: level*100 필요) 1레벨 100 필요 → 2레벨, 남은 50
  UPDATE user_pet SET level=2, exp=50 WHERE user_pet_id=1;
COMMIT;
-- ④-2 같은 판 보상 재요청 차단
DO $$ BEGIN
  INSERT INTO cell_transaction (user_id,amount,balance_after,reason,ref_id) VALUES (1,10,999,'GAME_REWARD',1);
  RAISE EXCEPTION 'FAIL: 중복 보상';
EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'OK: 중복 보상 차단'; END $$;

-- ⑤ 경험치 전승: 고양이(NORMAL) lv2 → 새로 뽑은 판다(LEGEND) : 비율 0.5 → lv1 (최소 1)
INSERT INTO user_pet (user_id,species_id) VALUES (1,4);
BEGIN;
  INSERT INTO pet_exp_transfer (user_id,from_user_pet_id,to_user_pet_id,from_level,to_level_before,to_level_after)
   VALUES (1,1,2,2,1,GREATEST(1,(2*0.5)::int));
  UPDATE user_pet SET level=GREATEST(1,(2*0.5)::int), exp=0 WHERE user_pet_id=2;
  UPDATE user_pet SET level=1, exp=0 WHERE user_pet_id=1;
COMMIT;

-- ⑥ 주간 랭킹 (뷰) → 1위 우편 + 칭호
INSERT INTO game_run (user_id,species_id,pet_level_snapshot,pet_stage_snapshot,mode,status,score,week_start,ended_at)
 VALUES (2,3,1,1,'ENDLESS','FINISHED',900,date_trunc('week',now())::date,now()),
        (1,2,2,1,'ENDLESS','FINISHED',700,date_trunc('week',now())::date,now());
INSERT INTO reward_mail (user_id,source_type,source_key,title,cell_amount,title_id)
SELECT user_id,'RANKING','RANK:'||week_start, rank_no||'위 보상',
       CASE WHEN rank_no=1 THEN 300 WHEN rank_no<=3 THEN 200 ELSE 100 END,
       CASE WHEN rank_no=1 THEN 1 END
FROM v_weekly_ranking WHERE week_start=date_trunc('week',now())::date
ON CONFLICT (user_id,source_type,source_key) DO NOTHING;
BEGIN;  -- 2번 회원 수령
  UPDATE reward_mail SET claimed_at=now() WHERE mail_id=1 AND claimed_at IS NULL;
  UPDATE app_user u SET cell_balance=u.cell_balance+m.cell_amount FROM reward_mail m WHERE m.mail_id=1 AND u.user_id=m.user_id;
  INSERT INTO cell_transaction (user_id,amount,balance_after,reason,ref_id)
    SELECT m.user_id,m.cell_amount,u.cell_balance,'MAIL_CLAIM',m.mail_id FROM reward_mail m JOIN app_user u USING(user_id) WHERE m.mail_id=1;
  INSERT INTO user_title (user_id,title_id) SELECT user_id,title_id FROM reward_mail WHERE mail_id=1 AND title_id IS NOT NULL ON CONFLICT DO NOTHING;
COMMIT;

-- 결과
SELECT u.nickname, u.cell_balance, (SELECT sum(amount) FROM cell_transaction t WHERE t.user_id=u.user_id) AS ledger_sum FROM app_user u ORDER BY 1;
SELECT user_pet_id, species_id, level, exp, evolution_stage FROM user_pet ORDER BY 1;
SELECT * FROM user_equipment; SELECT * FROM user_pet_equipment; SELECT * FROM user_stat_upgrade;
SELECT * FROM v_weekly_ranking ORDER BY rank_no;
SELECT mail_id,user_id,title,cell_amount,title_id,claimed_at IS NOT NULL AS claimed FROM reward_mail;
SELECT * FROM user_title;
