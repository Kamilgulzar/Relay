BEGIN;
CREATE TABLE IF NOT EXISTS relay_test_plans (
  case_id text PRIMARY KEY REFERENCES records(id),
  workspace_id text NOT NULL REFERENCES workspaces(id),
  plan jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS relay_test_runs (
  id text PRIMARY KEY,
  case_id text NOT NULL REFERENCES records(id),
  workspace_id text NOT NULL REFERENCES workspaces(id),
  requested_by text NOT NULL,
  plan jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('queued','running','passed','failed','blocked','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  evidence jsonb
);
CREATE UNIQUE INDEX IF NOT EXISTS relay_test_one_active ON relay_test_runs(case_id)
  WHERE status IN ('queued','running');
CREATE INDEX IF NOT EXISTS relay_test_history ON relay_test_runs(workspace_id,case_id,created_at DESC);
CREATE INDEX IF NOT EXISTS relay_test_queue ON relay_test_runs(created_at) WHERE status='queued';
COMMIT;
