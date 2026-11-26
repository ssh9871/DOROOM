-- 004: 유료 입장 버프 출동의 중복 결제 방지 (11/26 석훈 요청)
--  프론트가 출동마다 만드는 요청 ID. 같은 ID 로 재전송되면 서버는 결제 없이 기존 runId 를 돌려준다.
ALTER TABLE game_run ADD COLUMN IF NOT EXISTS start_request_id VARCHAR(64);
CREATE UNIQUE INDEX IF NOT EXISTS uq_game_run_start_request
    ON game_run (user_id, start_request_id) WHERE start_request_id IS NOT NULL;
