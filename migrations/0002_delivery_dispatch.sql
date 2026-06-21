-- gest Slack-live delivery gate + dispatcher — D1 schema (RAW_DB)
--
-- Adds the durable surfaces the live Slack path needs (Oracle review,
-- docs/research/oracle-slack-live-dispatch.md). All tables are provider-neutral
-- and platform-neutral: the same schema slots GitHub/Discord/Telegram in later
-- with zero dispatcher changes. No platform/runtime policy lives in SQL.
--
-- Applied via Alchemy's D1Database `migrationsDir` (numeric-prefix ordering).
-- Idempotent (`IF NOT EXISTS` / additive ALTERs guarded below) so a re-run is
-- safe; D1 applies each migration file at most once.

-- ---------------------------------------------------------------------------
-- delivery_work — the durable delivery-work ledger.
--
-- Created ATOMICALLY with the delivery dedupe claim in ONE D1 batch transaction
-- (prepareDelivery). The atomicity invariant: a dedupe claim NEVER exists without
-- a recoverable work row, so a crash after the claim but before the Queue send is
-- repaired (state='ready', enqueued_at IS NULL) rather than losing the event.
--
--   native_key  — the platform delivery identity (UNIQUE: collapses retries).
--   raw_id      — the raw delivery that won the claim (UNIQUE: one work per raw).
--   payload     — the JSON QueueMessage pointer (workId/rawId/nativeKey), NOT the
--                 raw body.
--   state       — ready | queued | processing | done | failed.
--   claim_token / lease_expires_at — consumer lease fencing (stops a duplicate
--                 Queue delivery from concurrently invoking the runtime).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS delivery_work (
  work_id          TEXT PRIMARY KEY,
  raw_id           TEXT NOT NULL UNIQUE,
  native_key       TEXT NOT NULL UNIQUE,
  platform         TEXT NOT NULL,
  tenant           TEXT NOT NULL,
  account          TEXT NOT NULL,
  payload          TEXT NOT NULL,           -- JSON QueueMessage pointer (not raw body)

  state            TEXT NOT NULL DEFAULT 'ready',
  enqueued_at      TEXT,
  claimed_by       TEXT,
  claim_token      TEXT,
  lease_expires_at TEXT,
  done_at          TEXT,

  attempts         INTEGER NOT NULL DEFAULT 0,
  last_error       TEXT,
  not_before       TEXT,

  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_delivery_work_state
  ON delivery_work (state, enqueued_at, lease_expires_at);
CREATE INDEX IF NOT EXISTS idx_delivery_work_native_key
  ON delivery_work (native_key);

-- ---------------------------------------------------------------------------
-- outbox — additive columns for live, lease-based, rate-aware dispatch.
--
-- The base table (0001) only modelled pending|sent|retry|failed with a single
-- rate_key. Live Slack needs: a 'sending' lease state, a persisted not_before
-- (rate/backoff correctness), explicit rate_keys[], an opaque credential_ref, the
-- stable effect_index for deterministic ordering, and created_at. SQLite has no
-- multi-ADD; one ALTER per column. (D1 runs this file once, so no IF-guard.)
-- ---------------------------------------------------------------------------
ALTER TABLE outbox ADD COLUMN not_before       TEXT;
ALTER TABLE outbox ADD COLUMN lease_id         TEXT;
ALTER TABLE outbox ADD COLUMN lease_expires_at TEXT;
ALTER TABLE outbox ADD COLUMN created_at       TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z';
ALTER TABLE outbox ADD COLUMN rate_keys        TEXT NOT NULL DEFAULT '[]';   -- JSON string[]
ALTER TABLE outbox ADD COLUMN credential_ref   TEXT NOT NULL DEFAULT '';
ALTER TABLE outbox ADD COLUMN tenant           TEXT NOT NULL DEFAULT '';
ALTER TABLE outbox ADD COLUMN account          TEXT NOT NULL DEFAULT '';
ALTER TABLE outbox ADD COLUMN effect_index     INTEGER NOT NULL DEFAULT 0;

-- The dispatcher claims by (state, not_before) and orders by
-- (created_at, caused_by_id, effect_index); index the claim/order path and leases.
CREATE INDEX IF NOT EXISTS idx_outbox_claim
  ON outbox (state, not_before);
CREATE INDEX IF NOT EXISTS idx_outbox_order
  ON outbox (created_at, caused_by_id, effect_index);
CREATE INDEX IF NOT EXISTS idx_outbox_lease
  ON outbox (state, lease_expires_at);

-- ---------------------------------------------------------------------------
-- rate_limit — shared rate-bucket state. The dispatcher must hold ALL of a
-- row's rate_keys (e.g. slack:method:* AND slack:channel-post:*) before sending;
-- a 429 defers every bucket until not_before. Keyed by the opaque rate key.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rate_limit (
  rate_key    TEXT PRIMARY KEY,
  not_before  TEXT NOT NULL,           -- earliest usable time (ISO-8601)
  reason      TEXT NOT NULL,           -- platform-429 | local-throttle | transient-backoff
  updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rate_limit_not_before ON rate_limit (not_before);

-- ---------------------------------------------------------------------------
-- dispatch_dlq — terminal/exhausted outbox rows routed out of the live path.
-- Cloudflare deletes Queue messages that exhaust retries unless a DLQ is set;
-- this is the durable record of effects that gave up (audit + manual replay).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dispatch_dlq (
  dlq_id      TEXT PRIMARY KEY,        -- outboxId + recordedAt
  outbox_id   TEXT NOT NULL,
  platform    TEXT NOT NULL,
  reason      TEXT NOT NULL,
  outbox      TEXT NOT NULL,           -- JSON: the full Outbox row
  attempt     TEXT NOT NULL,           -- JSON: the final OutboxAttempt
  recorded_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dispatch_dlq_outbox ON dispatch_dlq (outbox_id);
