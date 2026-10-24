-- =====================================================================
-- DOROOM DB 설계 초안 (중간발표용) - PostgreSQL 16 기준
-- 도로버스 개발 스택(PostgreSQL · Redis)에 맞춤
-- [MVP]  : 중간발표·데모에 필요한 필수 테이블
-- [확장] : 기획이 확정되면 추가할 테이블 (파일 아래쪽)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. 운영 설정값 : 코드에 숫자를 박지 않고 운영자가 바꿀 수 있게
-- ---------------------------------------------------------------------
CREATE TABLE game_setting (
    setting_key   VARCHAR(50)  PRIMARY KEY,           -- 예: SORTIE_MIN_HUNGER
    setting_value VARCHAR(100) NOT NULL,
    description   VARCHAR(200),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 1. 기준 데이터 (운영자가 관리, 모든 유저가 공유)
-- ---------------------------------------------------------------------
-- 능력 목록: 탄막 제거 / 회복 / 발사 속도 증가 / 보호막 ...
CREATE TABLE ability (
    ability_id    SERIAL       PRIMARY KEY,
    code          VARCHAR(30)  NOT NULL UNIQUE,       -- BULLET_CLEAR, HEAL ...
    name          VARCHAR(50)  NOT NULL,
    description   VARCHAR(200),
    effect_value  NUMERIC(8,2) NOT NULL DEFAULT 0,    -- 회복량, 배율 등
    cooldown_sec  INT          NOT NULL DEFAULT 0 CHECK (cooldown_sec >= 0),
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE
);

-- 펫 종류: 도로버스 기존 펫 약 24종 + 등급
CREATE TABLE pet_species (
    species_id         SERIAL       PRIMARY KEY,
    name               VARCHAR(50)  NOT NULL UNIQUE,
    grade              VARCHAR(10)  NOT NULL CHECK (grade IN ('RARE','UNIQUE','EPIC')),
    innate_ability_id  INT          NOT NULL REFERENCES ability(ability_id) ON DELETE RESTRICT,
    model_url          VARCHAR(300),                  -- GLB 에셋 경로
    is_active          BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- 진화 규칙: 단계별 필요 경험치·셀 비용·장착 슬롯 수 (가정: 모든 종 공통)
CREATE TABLE evolution_rule (
    evolution_stage     SMALLINT PRIMARY KEY CHECK (evolution_stage BETWEEN 1 AND 3),
    required_exp        INT      NOT NULL CHECK (required_exp >= 0),   -- 이 단계가 되기 위한 누적 경험치
    evolve_cell_cost    INT      NOT NULL CHECK (evolve_cell_cost >= 0),
    ability_slot_count  SMALLINT NOT NULL CHECK (ability_slot_count >= 0), -- 고유 능력 외 추가 장착 칸
    grants_revive       BOOLEAN  NOT NULL DEFAULT FALSE                -- 3단계 = 1회 부활
);

-- 아이템: 먹이·간식·장난감 (셀로 구매)
CREATE TABLE item (
    item_id         SERIAL       PRIMARY KEY,
    code            VARCHAR(30)  NOT NULL UNIQUE,
    name            VARCHAR(50)  NOT NULL,
    item_type       VARCHAR(10)  NOT NULL CHECK (item_type IN ('FOOD','SNACK','TOY')),
    price_cell      INT          NOT NULL CHECK (price_cell >= 0),
    hunger_restore  SMALLINT     NOT NULL DEFAULT 0,
    affection_restore    SMALLINT     NOT NULL DEFAULT 0,
    exp_gain        INT          NOT NULL DEFAULT 0,   -- 가정: 간식은 경험치도 줌
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE
);

-- 스테이지: 단계별 클리어 점수·보상
CREATE TABLE stage (
    stage_no           SMALLINT     PRIMARY KEY CHECK (stage_no >= 1),
    name               VARCHAR(50)  NOT NULL,
    difficulty_config  JSONB        NOT NULL DEFAULT '{}',  -- 몹 속도·탄막 패턴 등
    clear_bonus_score  INT          NOT NULL CHECK (clear_bonus_score >= 0),
    reward_cell        INT          NOT NULL CHECK (reward_cell >= 0)  -- 높을수록 큼
);

-- 가챠 풀: 셀 N개로 뽑기
CREATE TABLE gacha_pool (
    pool_id      SERIAL       PRIMARY KEY,
    name         VARCHAR(50)  NOT NULL,
    cost_cell    INT          NOT NULL CHECK (cost_cell > 0),
    pity_count   INT          CHECK (pity_count > 0),      -- 천장 (NULL = 없음)
    daily_limit  INT          CHECK (daily_limit > 0),     -- 하루 뽑기 제한 (NULL = 없음)
    starts_at    TIMESTAMPTZ,
    ends_at      TIMESTAMPTZ,
    is_active    BOOLEAN      NOT NULL DEFAULT TRUE
);

-- 가챠 풀에 들어있는 펫과 가중치 (확률 공개용)
CREATE TABLE gacha_pool_entry (
    pool_id     INT NOT NULL REFERENCES gacha_pool(pool_id) ON DELETE CASCADE,
    species_id  INT NOT NULL REFERENCES pet_species(species_id) ON DELETE RESTRICT,
    weight      INT NOT NULL CHECK (weight > 0),
    PRIMARY KEY (pool_id, species_id)
);

-- 주간 랭킹 순위별 보상 구간
CREATE TABLE ranking_reward_tier (
    tier_id      SERIAL PRIMARY KEY,
    rank_from    INT NOT NULL CHECK (rank_from >= 1),
    rank_to      INT NOT NULL,
    reward_cell  INT NOT NULL CHECK (reward_cell >= 0),
    CHECK (rank_to >= rank_from)
);

-- ---------------------------------------------------------------------
-- 2. 사용자별 데이터
-- ---------------------------------------------------------------------
-- 회원 (기업 Q3: 프로토타입은 로그인·회원 구조부터 팀이 직접 구성)
CREATE TABLE app_user (
    user_id        SERIAL       PRIMARY KEY,
    login_id       VARCHAR(30)  NOT NULL UNIQUE,
    password_hash  VARCHAR(200) NOT NULL,
    nickname       VARCHAR(20)  NOT NULL UNIQUE,      -- 랭킹에는 닉네임만 노출
    cell_balance   INT          NOT NULL DEFAULT 0 CHECK (cell_balance >= 0), -- 계산값 캐시
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- 셀 내역: 모든 획득(+)·사용(-)을 한 줄씩 기록 → 재화 흐름 분석
CREATE TABLE cell_transaction (
    tx_id          BIGSERIAL    PRIMARY KEY,
    user_id        INT          NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
    amount         INT          NOT NULL CHECK (amount <> 0),
    balance_after  INT          NOT NULL CHECK (balance_after >= 0),
    reason         VARCHAR(20)  NOT NULL CHECK (reason IN
                    ('GAME_REWARD','STAGE_FIRST_CLEAR','MAIL_CLAIM',
                     'GACHA','DUPLICATE_REFUND','EVOLVE','ITEM_PURCHASE','ADMIN')),
    ref_id         BIGINT,                             -- run_id / mail_id / gacha_id ...
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_cell_tx_user_time ON cell_transaction (user_id, created_at DESC);
-- 같은 보상이 두 번 들어오지 않게 (중복 지급 방지)
CREATE UNIQUE INDEX uq_cell_tx_reward_once ON cell_transaction (user_id, reason, ref_id)
    WHERE reason IN ('GAME_REWARD','STAGE_FIRST_CLEAR','MAIL_CLAIM','DUPLICATE_REFUND');

-- 보유 펫: 개별 펫의 성장·상태 정보
CREATE TABLE user_pet (
    user_pet_id         SERIAL       PRIMARY KEY,
    user_id             INT          NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
    species_id          INT          NOT NULL REFERENCES pet_species(species_id) ON DELETE RESTRICT,
    nickname            VARCHAR(20),
    evolution_stage     SMALLINT     NOT NULL DEFAULT 1 REFERENCES evolution_rule(evolution_stage),
    exp                 INT          NOT NULL DEFAULT 0 CHECK (exp >= 0),
    hunger              SMALLINT     NOT NULL DEFAULT 100 CHECK (hunger BETWEEN 0 AND 100),
    affection                SMALLINT     NOT NULL DEFAULT 100 CHECK (affection BETWEEN 0 AND 100),
    is_representative   BOOLEAN      NOT NULL DEFAULT FALSE, -- 마이룸에서 따라다니는 펫
    last_interacted_at  TIMESTAMPTZ  NOT NULL DEFAULT now(), -- 00시 상태 변화 판정용
    state_checked_on    DATE,                                -- 00시 배치 중복 실행 방지
    acquired_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (user_id, species_id)          -- 가정: 같은 종 중복 보유 X (중복은 셀로 환급)
);
CREATE UNIQUE INDEX uq_user_pet_one_rep ON user_pet (user_id) WHERE is_representative;

-- 펫에 추가로 장착한 능력 (고유 능력은 pet_species에 있음)
CREATE TABLE user_pet_ability (
    user_pet_id  INT      NOT NULL REFERENCES user_pet(user_pet_id) ON DELETE CASCADE,
    slot_no      SMALLINT NOT NULL CHECK (slot_no BETWEEN 1 AND 3),
    ability_id   INT      NOT NULL REFERENCES ability(ability_id) ON DELETE RESTRICT,
    equipped_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_pet_id, slot_no),
    UNIQUE (user_pet_id, ability_id)     -- 같은 능력 두 칸 장착 X
);

-- 인벤토리: 아이템 수량
CREATE TABLE user_item (
    user_id   INT NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
    item_id   INT NOT NULL REFERENCES item(item_id) ON DELETE RESTRICT,
    quantity  INT NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    PRIMARY KEY (user_id, item_id)
);

-- 돌봄 기록: 밥 주기·쓰다듬기·산책
CREATE TABLE pet_interaction_log (
    log_id            BIGSERIAL    PRIMARY KEY,
    user_pet_id       INT          NOT NULL REFERENCES user_pet(user_pet_id) ON DELETE CASCADE,
    interaction_type  VARCHAR(10)  NOT NULL CHECK (interaction_type IN ('FEED','PET','WALK')),
    item_id           INT          REFERENCES item(item_id) ON DELETE SET NULL, -- 밥 줄 때만
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_interaction_pet_time ON pet_interaction_log (user_pet_id, created_at DESC);

-- 가챠 기록: 확률 검증·천장 계산·하루 제한 계산에 사용
CREATE TABLE gacha_log (
    gacha_id      BIGSERIAL    PRIMARY KEY,
    user_id       INT          NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
    pool_id       INT          NOT NULL REFERENCES gacha_pool(pool_id) ON DELETE RESTRICT,
    species_id    INT          NOT NULL REFERENCES pet_species(species_id) ON DELETE RESTRICT,
    is_duplicate  BOOLEAN      NOT NULL DEFAULT FALSE,
    is_pity       BOOLEAN      NOT NULL DEFAULT FALSE,  -- 천장으로 확정 지급됐는지
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_gacha_user_pool_time ON gacha_log (user_id, pool_id, created_at DESC);

-- 게임 한 판 기록
CREATE TABLE game_run (
    run_id              BIGSERIAL    PRIMARY KEY,
    user_id             INT          NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
    user_pet_id         INT          REFERENCES user_pet(user_pet_id) ON DELETE SET NULL,
    species_id          INT          NOT NULL REFERENCES pet_species(species_id), -- 출전 펫 스냅샷
    pet_stage_snapshot  SMALLINT     NOT NULL,
    mode                VARCHAR(10)  NOT NULL CHECK (mode IN ('STAGE','ENDLESS')),
    status              VARCHAR(10)  NOT NULL DEFAULT 'PLAYING'
                         CHECK (status IN ('PLAYING','FINISHED','ABORTED')),
    reached_stage       SMALLINT     NOT NULL DEFAULT 1,
    survival_ms         INT          NOT NULL DEFAULT 0 CHECK (survival_ms >= 0),
    kill_count          INT          NOT NULL DEFAULT 0 CHECK (kill_count >= 0),
    stage_bonus_score   INT          NOT NULL DEFAULT 0,
    score               INT          NOT NULL DEFAULT 0,  -- 서버가 계산해 저장 (랭킹용)
    revive_used         BOOLEAN      NOT NULL DEFAULT FALSE,
    reward_cell         INT          NOT NULL DEFAULT 0,
    exp_gained          INT          NOT NULL DEFAULT 0,
    week_start          DATE,                              -- 랭킹 주차 (월요일 날짜)
    started_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    ended_at            TIMESTAMPTZ
);
CREATE INDEX idx_run_ranking ON game_run (week_start, mode, score DESC) WHERE status = 'FINISHED';
CREATE INDEX idx_run_user_time ON game_run (user_id, started_at DESC);

-- 스테이지 첫 클리어 기록: 다음 스테이지 해금 + 첫 클리어 보상 1회
CREATE TABLE user_stage_clear (
    user_id          INT       NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
    stage_no         SMALLINT  NOT NULL REFERENCES stage(stage_no) ON DELETE RESTRICT,
    first_run_id     BIGINT    REFERENCES game_run(run_id) ON DELETE SET NULL,
    first_cleared_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, stage_no)
);

-- 주간 랭킹 마감 결과 (일요일 밤 스냅샷)
CREATE TABLE weekly_ranking_result (
    week_start   DATE   NOT NULL,
    user_id      INT    NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
    rank_no      INT    NOT NULL CHECK (rank_no >= 1),
    best_score   INT    NOT NULL,
    best_run_id  BIGINT REFERENCES game_run(run_id) ON DELETE SET NULL,
    PRIMARY KEY (week_start, user_id)
);

-- 우편함 보상: 랭킹 보상을 우편으로 보내고 '받기'로 수령
CREATE TABLE reward_mail (
    mail_id      BIGSERIAL    PRIMARY KEY,
    user_id      INT          NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
    source_type  VARCHAR(10)  NOT NULL CHECK (source_type IN ('RANKING','QUEST','EVENT')),
    source_key   VARCHAR(50)  NOT NULL,                -- 예: 'RANK:2026-10-19'
    title        VARCHAR(100) NOT NULL,
    cell_amount  INT          NOT NULL CHECK (cell_amount > 0),
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    claimed_at   TIMESTAMPTZ,
    expires_at   TIMESTAMPTZ,
    UNIQUE (user_id, source_type, source_key)          -- 같은 주 랭킹 보상 중복 발송 방지
);
CREATE INDEX idx_mail_unclaimed ON reward_mail (user_id) WHERE claimed_at IS NULL;


-- =====================================================================
-- [확장] 기획 확정 후 추가 (현재 정해야 할 것에 해당)
-- =====================================================================
-- 퀘스트 (일일·주간, 보상은 셀 위주) - 퀘스트 내용 미정
CREATE TABLE quest (
    quest_id        SERIAL       PRIMARY KEY,
    period          VARCHAR(10)  NOT NULL CHECK (period IN ('DAILY','WEEKLY')),
    title           VARCHAR(100) NOT NULL,
    condition_type  VARCHAR(30)  NOT NULL,    -- PLAY_COUNT, FEED_PET, REACH_STAGE ...
    target_count    INT          NOT NULL CHECK (target_count > 0),
    reward_cell     INT          NOT NULL CHECK (reward_cell >= 0),
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE
);
CREATE TABLE user_quest (
    user_id       INT  NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
    quest_id      INT  NOT NULL REFERENCES quest(quest_id) ON DELETE CASCADE,
    period_key    DATE NOT NULL,              -- 일일=그날, 주간=그 주 월요일
    progress      INT  NOT NULL DEFAULT 0,
    completed_at  TIMESTAMPTZ,
    claimed_at    TIMESTAMPTZ,
    PRIMARY KEY (user_id, quest_id, period_key)
);

-- 펫 스킨 - 획득 방법(가챠/랭킹) 미정
CREATE TABLE pet_skin (
    skin_id      SERIAL       PRIMARY KEY,
    species_id   INT          NOT NULL REFERENCES pet_species(species_id) ON DELETE CASCADE,
    name         VARCHAR(50)  NOT NULL,
    is_shiny     BOOLEAN      NOT NULL DEFAULT FALSE,  -- 이로치 도입 시
    model_url    VARCHAR(300)
);
CREATE TABLE user_pet_skin (
    user_id      INT NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
    skin_id      INT NOT NULL REFERENCES pet_skin(skin_id) ON DELETE RESTRICT,
    acquired_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, skin_id)
);
ALTER TABLE user_pet ADD COLUMN equipped_skin_id INT REFERENCES pet_skin(skin_id) ON DELETE SET NULL;

-- 펫 농장 꾸미기·방문 - 배치 방식(방목/우리)·이름 미정
CREATE TABLE farm (
    user_id      INT          PRIMARY KEY REFERENCES app_user(user_id) ON DELETE CASCADE,
    farm_name    VARCHAR(30),
    visit_open   BOOLEAN      NOT NULL DEFAULT TRUE
);
CREATE TABLE decoration (
    decoration_id  SERIAL       PRIMARY KEY,
    name           VARCHAR(50)  NOT NULL,
    price_cell     INT          NOT NULL CHECK (price_cell >= 0),
    model_url      VARCHAR(300)
);
CREATE TABLE farm_object (
    object_id      BIGSERIAL    PRIMARY KEY,
    user_id        INT          NOT NULL REFERENCES farm(user_id) ON DELETE CASCADE,
    decoration_id  INT          NOT NULL REFERENCES decoration(decoration_id) ON DELETE RESTRICT,
    pos_x NUMERIC(7,2) NOT NULL DEFAULT 0,
    pos_y NUMERIC(7,2) NOT NULL DEFAULT 0,
    pos_z NUMERIC(7,2) NOT NULL DEFAULT 0,
    rot_y NUMERIC(6,2) NOT NULL DEFAULT 0
);
CREATE TABLE farm_visit_log (
    visit_id    BIGSERIAL   PRIMARY KEY,
    visitor_id  INT         NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
    host_id     INT         NOT NULL REFERENCES farm(user_id) ON DELETE CASCADE,
    visited_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (visitor_id <> host_id)
);
