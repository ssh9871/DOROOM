-- =====================================================================
-- DOROOM DB v2 (2026-11-12) - PostgreSQL 16
-- v1 대비: 등급 규칙(Normal/Rare/Legend)·레벨·전승·장비·스탯 강화·칭호 추가
--          능력 장착칸, 주간 랭킹 스냅샷, 랭킹 보상 구간, 펫 스킨, 농장, 퀘스트 제거
-- 표기: [기준] 운영자가 관리하는 기준 데이터 / [사용자] 회원마다 생기는 데이터
--       [가정] 팀 결정 전 기본값 - 값만 바꾸면 됨
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. 운영 설정 [기준]
-- ---------------------------------------------------------------------
CREATE TABLE game_setting (
    setting_key   VARCHAR(50)  PRIMARY KEY,
    setting_value VARCHAR(100) NOT NULL,
    description   VARCHAR(200),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 1. 펫 기준 데이터 [기준]
-- ---------------------------------------------------------------------
-- 능력: 종마다 고유 능력 1개 (장착 개념 없음)
CREATE TABLE ability (
    ability_id    SERIAL       PRIMARY KEY,
    code          VARCHAR(30)  NOT NULL UNIQUE,      -- BULLET_CLEAR, HEAL, RAPID_FIRE, SHIELD
    name          VARCHAR(50)  NOT NULL,
    description   VARCHAR(200),
    effect_value  NUMERIC(8,2) NOT NULL DEFAULT 0,
    cooldown_sec  INT          NOT NULL DEFAULT 0 CHECK (cooldown_sec >= 0),
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE
);

-- 등급 규칙: 등급마다 만렙·경험치 통·장비 슬롯 수가 다름
CREATE TABLE pet_grade_rule (
    grade               VARCHAR(10) PRIMARY KEY CHECK (grade IN ('NORMAL','RARE','LEGEND')),
    grade_order         SMALLINT    NOT NULL UNIQUE,             -- 1,2,3 (전승 비율 계산용)
    max_level           SMALLINT    NOT NULL CHECK (max_level > 0),
    base_exp_per_level  INT         NOT NULL CHECK (base_exp_per_level > 0), -- 레벨업 필요 경험치 = level * base
    equip_slot_count    SMALLINT    NOT NULL CHECK (equip_slot_count BETWEEN 0 AND 3), -- [가정] 슬롯 해금 = 등급 기준
    transfer_ratio      NUMERIC(4,2) NOT NULL DEFAULT 1.00       -- 상위 등급으로 전승 시 비율 [가정]
);

-- 진화 규칙: 등급별 단계마다 필요 레벨·셀·부활 여부
CREATE TABLE pet_evolution_rule (
    grade            VARCHAR(10) NOT NULL REFERENCES pet_grade_rule(grade),
    evolution_stage  SMALLINT    NOT NULL CHECK (evolution_stage BETWEEN 1 AND 3),
    required_level   SMALLINT    NOT NULL CHECK (required_level >= 1),  -- 이 단계로 진화하기 위한 레벨
    evolve_cell_cost INT         NOT NULL DEFAULT 0 CHECK (evolve_cell_cost >= 0),
    grants_revive    BOOLEAN     NOT NULL DEFAULT FALSE,               -- 최종 단계 = 1회 부활
    PRIMARY KEY (grade, evolution_stage)
);

-- 펫 종류 24종
CREATE TABLE pet_species (
    species_id         SERIAL       PRIMARY KEY,
    name               VARCHAR(50)  NOT NULL UNIQUE,
    grade              VARCHAR(10)  NOT NULL REFERENCES pet_grade_rule(grade),
    innate_ability_id  INT          NOT NULL REFERENCES ability(ability_id) ON DELETE RESTRICT,
    model_url          VARCHAR(300),
    is_active          BOOLEAN      NOT NULL DEFAULT TRUE
);

-- ---------------------------------------------------------------------
-- 2. 아이템·장비·강화 기준 데이터 [기준]
-- ---------------------------------------------------------------------
-- 소모 아이템: 먹이·간식·장난감·경험치 포션·진화석·게임 버프
CREATE TABLE item (
    item_id          SERIAL       PRIMARY KEY,
    code             VARCHAR(30)  NOT NULL UNIQUE,
    name             VARCHAR(50)  NOT NULL,
    item_type        VARCHAR(12)  NOT NULL CHECK (item_type IN ('FOOD','SNACK','TOY','EXP_POTION','EVOLVE_STONE','GAME_BUFF')),
    price_cell       INT          NOT NULL CHECK (price_cell >= 0),
    hunger_restore   SMALLINT     NOT NULL DEFAULT 0,
    affection_restore SMALLINT    NOT NULL DEFAULT 0,
    exp_gain         INT          NOT NULL DEFAULT 0,       -- EXP_POTION만 사용 (간식은 0)
    effect_config    JSONB        NOT NULL DEFAULT '{}',    -- GAME_BUFF: {"type":"INVINCIBLE","sec":5} 등
    is_active        BOOLEAN      NOT NULL DEFAULT TRUE
);

-- 장비: 같은 계열(line)이 등급별로 한 행씩. Normal 장갑 → Rare 장갑 → Legend 장갑
CREATE TABLE equipment (
    equipment_id       SERIAL       PRIMARY KEY,
    line_code          VARCHAR(30)  NOT NULL,                 -- GLOVE, HELMET, BOOTS ...
    name               VARCHAR(50)  NOT NULL,
    slot_type          VARCHAR(12)  NOT NULL CHECK (slot_type IN ('HEAD','BODY','ACCESSORY')), -- [가정] 슬롯 3종
    grade              VARCHAR(10)  NOT NULL CHECK (grade IN ('NORMAL','RARE','LEGEND')),
    stat_code          VARCHAR(20)  NOT NULL,                 -- 올리는 스탯 (stat_upgrade_rule.stat_code와 동일 체계)
    stat_value         NUMERIC(8,2) NOT NULL,                 -- 예: 10 = +10%
    next_equipment_id  INT          REFERENCES equipment(equipment_id) ON DELETE SET NULL, -- 합치면 되는 다음 등급
    merge_count        SMALLINT     CHECK (merge_count > 0),  -- 다음 등급으로 합치는 데 필요한 개수 [가정]
    merge_cell_cost    INT          NOT NULL DEFAULT 0 CHECK (merge_cell_cost >= 0),
    model_url          VARCHAR(300),
    is_active          BOOLEAN      NOT NULL DEFAULT TRUE,
    UNIQUE (line_code, grade)
);

-- 기본 스탯 강화 규칙 (회원 단위, 뱀서류)
CREATE TABLE stat_upgrade_rule (
    stat_code    VARCHAR(20)  NOT NULL,                 -- ATTACK, MAX_HP, MOVE_SPEED, BULLET_SPEED [가정]
    level        SMALLINT     NOT NULL CHECK (level >= 1),
    cell_cost    INT          NOT NULL CHECK (cell_cost >= 0),
    value_bonus  NUMERIC(8,2) NOT NULL,                 -- 이 레벨에서의 누적 보너스(%)
    PRIMARY KEY (stat_code, level)
);

-- ---------------------------------------------------------------------
-- 3. 게임·뽑기·칭호 기준 데이터 [기준]
-- ---------------------------------------------------------------------
CREATE TABLE stage (
    stage_no               SMALLINT     PRIMARY KEY CHECK (stage_no >= 1),
    name                   VARCHAR(50)  NOT NULL,          -- 작전 1 낯선 순찰 ...
    boss_name              VARCHAR(50),
    briefing               VARCHAR(300),                   -- 출동 대사
    difficulty_config      JSONB        NOT NULL DEFAULT '{}',
    clear_bonus_score      INT          NOT NULL CHECK (clear_bonus_score >= 0),
    first_clear_reward_cell INT         NOT NULL CHECK (first_clear_reward_cell >= 0), -- 1회성 클리어 보상
    repeat_reward_cell     INT          NOT NULL DEFAULT 0 CHECK (repeat_reward_cell >= 0)
);

-- 뽑기 풀: 펫 뽑기 / 장비 뽑기
CREATE TABLE gacha_pool (
    pool_id      SERIAL       PRIMARY KEY,
    pool_type    VARCHAR(10)  NOT NULL CHECK (pool_type IN ('PET','EQUIPMENT')),
    name         VARCHAR(50)  NOT NULL,
    cost_cell    INT          NOT NULL CHECK (cost_cell > 0),
    pity_count   INT          CHECK (pity_count > 0),
    daily_limit  INT          CHECK (daily_limit > 0),
    is_active    BOOLEAN      NOT NULL DEFAULT TRUE
);

CREATE TABLE gacha_pool_entry (
    entry_id      SERIAL PRIMARY KEY,
    pool_id       INT NOT NULL REFERENCES gacha_pool(pool_id) ON DELETE CASCADE,
    species_id    INT REFERENCES pet_species(species_id) ON DELETE RESTRICT,
    equipment_id  INT REFERENCES equipment(equipment_id) ON DELETE RESTRICT,
    weight        INT NOT NULL CHECK (weight > 0),
    CHECK ((species_id IS NOT NULL)::int + (equipment_id IS NOT NULL)::int = 1)  -- 둘 중 하나만
);

-- 칭호
CREATE TABLE title (
    title_id        SERIAL       PRIMARY KEY,
    code            VARCHAR(30)  NOT NULL UNIQUE,
    name            VARCHAR(50)  NOT NULL,
    condition_desc  VARCHAR(200)                      -- "주간 랭킹 1위", "작전 4 클리어" 등
);

-- ---------------------------------------------------------------------
-- 4. 회원·재화 [사용자]
-- ---------------------------------------------------------------------
CREATE TABLE app_user (
    user_id            SERIAL       PRIMARY KEY,
    login_id           VARCHAR(30)  NOT NULL UNIQUE,
    password_hash      VARCHAR(200) NOT NULL,
    nickname           VARCHAR(20)  NOT NULL UNIQUE,
    cell_balance       INT          NOT NULL DEFAULT 0 CHECK (cell_balance >= 0),
    equipped_title_id  INT          REFERENCES title(title_id) ON DELETE SET NULL,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE cell_transaction (
    tx_id          BIGSERIAL    PRIMARY KEY,
    user_id        INT          NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
    amount         INT          NOT NULL CHECK (amount <> 0),
    balance_after  INT          NOT NULL CHECK (balance_after >= 0),
    reason         VARCHAR(20)  NOT NULL CHECK (reason IN
                    ('GAME_REWARD','STAGE_FIRST_CLEAR','MAIL_CLAIM','RANK_REWARD',
                     'PET_GACHA','EQUIP_GACHA','DUPLICATE_REFUND',
                     'EVOLVE','ITEM_PURCHASE','EQUIP_MERGE','STAT_UPGRADE','ADMIN')),
    ref_id         BIGINT,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_cell_tx_user_time ON cell_transaction (user_id, created_at DESC);
CREATE UNIQUE INDEX uq_cell_tx_reward_once ON cell_transaction (user_id, reason, ref_id)
    WHERE reason IN ('GAME_REWARD','STAGE_FIRST_CLEAR','MAIL_CLAIM','RANK_REWARD','DUPLICATE_REFUND');

CREATE TABLE user_title (
    user_id      INT NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
    title_id     INT NOT NULL REFERENCES title(title_id) ON DELETE CASCADE,
    acquired_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, title_id)
);

-- ---------------------------------------------------------------------
-- 5. 펫 [사용자]
-- ---------------------------------------------------------------------
CREATE TABLE user_pet (
    user_pet_id         SERIAL       PRIMARY KEY,
    user_id             INT          NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
    species_id          INT          NOT NULL REFERENCES pet_species(species_id) ON DELETE RESTRICT,
    nickname            VARCHAR(20),
    level               SMALLINT     NOT NULL DEFAULT 1 CHECK (level >= 1),
    exp                 INT          NOT NULL DEFAULT 0 CHECK (exp >= 0),   -- 현재 레벨에서 쌓은 경험치
    evolution_stage     SMALLINT     NOT NULL DEFAULT 1 CHECK (evolution_stage BETWEEN 1 AND 3),
    hunger              SMALLINT     NOT NULL DEFAULT 100 CHECK (hunger BETWEEN 0 AND 100),
    affection           SMALLINT     NOT NULL DEFAULT 100 CHECK (affection BETWEEN 0 AND 100),
    is_representative   BOOLEAN      NOT NULL DEFAULT FALSE,
    last_interacted_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    state_checked_on    DATE,
    acquired_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (user_id, species_id)                     -- [가정] 같은 종 1마리
);
CREATE UNIQUE INDEX uq_user_pet_one_rep ON user_pet (user_id) WHERE is_representative;

-- 펫 장비 장착 (슬롯 수는 등급 규칙에서 계산, 서버가 검사)
CREATE TABLE user_pet_equipment (
    user_pet_id   INT NOT NULL REFERENCES user_pet(user_pet_id) ON DELETE CASCADE,
    slot_no       SMALLINT NOT NULL CHECK (slot_no BETWEEN 1 AND 3),
    equipment_id  INT NOT NULL REFERENCES equipment(equipment_id) ON DELETE RESTRICT,
    equipped_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_pet_id, slot_no)
);

-- 경험치 전승 기록
CREATE TABLE pet_exp_transfer (
    transfer_id      BIGSERIAL   PRIMARY KEY,
    user_id          INT         NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
    from_user_pet_id INT         NOT NULL REFERENCES user_pet(user_pet_id) ON DELETE CASCADE,
    to_user_pet_id   INT         NOT NULL REFERENCES user_pet(user_pet_id) ON DELETE CASCADE,
    from_level       SMALLINT    NOT NULL,
    to_level_before  SMALLINT    NOT NULL,
    to_level_after   SMALLINT    NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (from_user_pet_id <> to_user_pet_id)
);

-- 돌봄 기록
CREATE TABLE pet_interaction_log (
    log_id            BIGSERIAL    PRIMARY KEY,
    user_pet_id       INT          NOT NULL REFERENCES user_pet(user_pet_id) ON DELETE CASCADE,
    interaction_type  VARCHAR(10)  NOT NULL CHECK (interaction_type IN ('FEED','PET','PLAY')),
    item_id           INT          REFERENCES item(item_id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_interaction_pet_time ON pet_interaction_log (user_pet_id, created_at DESC);

-- ---------------------------------------------------------------------
-- 6. 인벤토리·장비·강화 [사용자]
-- ---------------------------------------------------------------------
CREATE TABLE user_item (
    user_id   INT NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
    item_id   INT NOT NULL REFERENCES item(item_id) ON DELETE RESTRICT,
    quantity  INT NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    PRIMARY KEY (user_id, item_id)
);

-- 보유 장비: 같은 장비 n개를 모아 합치므로 수량으로 관리
CREATE TABLE user_equipment (
    user_id       INT NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
    equipment_id  INT NOT NULL REFERENCES equipment(equipment_id) ON DELETE RESTRICT,
    quantity      INT NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    PRIMARY KEY (user_id, equipment_id)
);

-- 회원별 기본 스탯 강화
CREATE TABLE user_stat_upgrade (
    user_id    INT NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
    stat_code  VARCHAR(20) NOT NULL,
    level      SMALLINT NOT NULL DEFAULT 0 CHECK (level >= 0),
    PRIMARY KEY (user_id, stat_code)
);

-- ---------------------------------------------------------------------
-- 7. 뽑기·게임·보상 [사용자]
-- ---------------------------------------------------------------------
CREATE TABLE gacha_log (
    gacha_id      BIGSERIAL    PRIMARY KEY,
    user_id       INT          NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
    pool_id       INT          NOT NULL REFERENCES gacha_pool(pool_id) ON DELETE RESTRICT,
    species_id    INT          REFERENCES pet_species(species_id) ON DELETE RESTRICT,
    equipment_id  INT          REFERENCES equipment(equipment_id) ON DELETE RESTRICT,
    is_duplicate  BOOLEAN      NOT NULL DEFAULT FALSE,
    is_pity       BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CHECK ((species_id IS NOT NULL)::int + (equipment_id IS NOT NULL)::int = 1)
);
CREATE INDEX idx_gacha_user_pool_time ON gacha_log (user_id, pool_id, created_at DESC);

CREATE TABLE game_run (
    run_id              BIGSERIAL    PRIMARY KEY,
    user_id             INT          NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
    user_pet_id         INT          REFERENCES user_pet(user_pet_id) ON DELETE SET NULL,
    species_id          INT          NOT NULL REFERENCES pet_species(species_id),
    pet_level_snapshot  SMALLINT     NOT NULL,
    pet_stage_snapshot  SMALLINT     NOT NULL,
    mode                VARCHAR(10)  NOT NULL CHECK (mode IN ('STAGE','ENDLESS')),
    stage_no            SMALLINT     REFERENCES stage(stage_no),  -- STAGE 모드일 때 도전한 작전
    status              VARCHAR(10)  NOT NULL DEFAULT 'PLAYING' CHECK (status IN ('PLAYING','FINISHED','ABORTED')),
    applied_buffs       JSONB        NOT NULL DEFAULT '[]',        -- 시작 전 사용한 버프 아이템
    reached_wave        SMALLINT     NOT NULL DEFAULT 1,
    cleared             BOOLEAN      NOT NULL DEFAULT FALSE,       -- STAGE 모드 보스 처치 여부
    survival_ms         INT          NOT NULL DEFAULT 0 CHECK (survival_ms >= 0),
    kill_count          INT          NOT NULL DEFAULT 0 CHECK (kill_count >= 0),
    score               INT          NOT NULL DEFAULT 0,
    revive_used         BOOLEAN      NOT NULL DEFAULT FALSE,
    reward_cell         INT          NOT NULL DEFAULT 0,
    exp_gained          INT          NOT NULL DEFAULT 0,
    week_start          DATE,
    started_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    ended_at            TIMESTAMPTZ
);
-- 주간 랭킹은 이 인덱스로 game_run을 직접 집계 (스냅샷 테이블 없음)
CREATE INDEX idx_run_ranking ON game_run (week_start, score DESC) WHERE status = 'FINISHED' AND mode = 'ENDLESS';
CREATE INDEX idx_run_user_time ON game_run (user_id, started_at DESC);

CREATE TABLE user_stage_clear (
    user_id          INT       NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
    stage_no         SMALLINT  NOT NULL REFERENCES stage(stage_no) ON DELETE RESTRICT,
    first_run_id     BIGINT    REFERENCES game_run(run_id) ON DELETE SET NULL,
    first_cleared_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, stage_no)
);

CREATE TABLE reward_mail (
    mail_id      BIGSERIAL    PRIMARY KEY,
    user_id      INT          NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
    source_type  VARCHAR(10)  NOT NULL CHECK (source_type IN ('RANKING','EVENT','ADMIN')),
    source_key   VARCHAR(50)  NOT NULL,            -- 'RANK:2026-11-10'
    title        VARCHAR(100) NOT NULL,
    cell_amount  INT          NOT NULL DEFAULT 0 CHECK (cell_amount >= 0),
    title_id     INT          REFERENCES title(title_id) ON DELETE SET NULL,  -- 칭호 보상
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    claimed_at   TIMESTAMPTZ,
    expires_at   TIMESTAMPTZ,
    UNIQUE (user_id, source_type, source_key)
);
CREATE INDEX idx_mail_unclaimed ON reward_mail (user_id) WHERE claimed_at IS NULL;

-- =====================================================================
-- 주간 랭킹 뷰 (테이블 대신 집계)
-- =====================================================================
CREATE VIEW v_weekly_ranking AS
SELECT week_start, user_id,
       MAX(score) AS best_score,
       RANK() OVER (PARTITION BY week_start ORDER BY MAX(score) DESC) AS rank_no
FROM game_run
WHERE status = 'FINISHED' AND mode = 'ENDLESS' AND week_start IS NOT NULL
GROUP BY week_start, user_id;
