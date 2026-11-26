ALTER TABLE game_run
  ADD COLUMN score_reward_cell INT NOT NULL DEFAULT 0 CHECK (score_reward_cell >= 0);
