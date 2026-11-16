BEGIN;
ALTER TABLE relay_test_runs
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'background'
    CHECK (mode IN ('background','watch')),
  ADD COLUMN IF NOT EXISTS live_preview jsonb;
COMMIT;
