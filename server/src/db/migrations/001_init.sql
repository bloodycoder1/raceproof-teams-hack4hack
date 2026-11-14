CREATE TABLE users (
  id               BIGSERIAL PRIMARY KEY,
  email            TEXT NOT NULL UNIQUE,
  password_hash    TEXT NOT NULL,
  name             TEXT NOT NULL,
  timezone         TEXT NOT NULL,
  utc_offset_min   INT  NOT NULL,
  skills           TEXT[] NOT NULL DEFAULT '{}',
  looking_for_team BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE hackathons (
  id            BIGSERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  min_team_size INT NOT NULL CHECK (min_team_size >= 1),
  max_team_size INT NOT NULL,
  CHECK (max_team_size >= min_team_size)
);

CREATE TABLE teams (
  id                BIGSERIAL PRIMARY KEY,
  hackathon_id      BIGINT NOT NULL REFERENCES hackathons(id),
  name              TEXT NOT NULL,
  leader_id         BIGINT NOT NULL REFERENCES users(id),
  member_count      INT NOT NULL DEFAULT 1,   -- only change while holding the team row lock
  is_open           BOOLEAN NOT NULL DEFAULT true,
  invite_code_hash  BYTEA,                    -- store a hash, never the code
  invite_expires_at TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (hackathon_id, name)
);
CREATE UNIQUE INDEX teams_invite_code_idx ON teams (invite_code_hash) WHERE invite_code_hash IS NOT NULL;

CREATE TABLE team_members (
  team_id      BIGINT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  hackathon_id BIGINT NOT NULL,
  user_id      BIGINT NOT NULL REFERENCES users(id),
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, user_id),
  UNIQUE (hackathon_id, user_id)              -- one team per person per hackathon
);

CREATE TABLE join_requests (
  id         BIGSERIAL PRIMARY KEY,
  team_id    BIGINT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id    BIGINT NOT NULL REFERENCES users(id),
  status     TEXT NOT NULL CHECK (status IN ('pending','accepted','declined','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX one_pending_request ON join_requests (team_id, user_id) WHERE status = 'pending';

CREATE TABLE idempotency_keys (
  user_id      BIGINT NOT NULL,
  key          TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status_code  INT,
  response     JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);

CREATE TABLE audit_log (
  id       BIGSERIAL PRIMARY KEY,
  at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_id BIGINT,
  team_id  BIGINT,                            -- no FK: the log must outlive deleted teams
  action   TEXT NOT NULL,
  details  JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX audit_log_team_idx ON audit_log (team_id, at DESC);

-- Board: open teams, newest first (keyset pagination on created_at, id)
CREATE INDEX teams_board_idx ON teams (hackathon_id, created_at DESC, id DESC) WHERE is_open;

-- Looking for team users index for fast board lookup
CREATE INDEX idx_users_looking ON users (created_at DESC) WHERE looking_for_team;

