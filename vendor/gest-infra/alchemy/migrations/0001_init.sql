-- gest raw-first ingest — D1 schema (RAW_DB)
--
-- This is the metadata + dedupe + journal + outbox surface for the Cloudflare
-- deployment. Exact body bytes live in R2 (RAW_BUCKET) keyed by body_hash; D1
-- holds only the neutral metadata row, the dedupe markers, the canonical event
-- journal, the runtime records, and the outbox. No platform/runtime policy lives
-- in SQL — these tables only persist the records the adapters already produced.
--
-- Applied via Alchemy's D1Database `migrationsDir` (wrangler-compatible numeric
-- prefix ordering). New files are detected and applied on each deploy; applied
-- files are skipped. Idempotent (`IF NOT EXISTS`) so a re-run is safe.

-- ---------------------------------------------------------------------------
-- Raw metadata (one row per rawId). Body bytes are in R2; this row carries the
-- neutral RawDelivery record MINUS the body, plus a body_hash pointer.
-- Rejected-signature deliveries arrive with has_body=0 (no attacker bytes in R2).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS raw_delivery (
  raw_id      TEXT PRIMARY KEY,
  body_hash   TEXT NOT NULL,
  has_body    INTEGER NOT NULL DEFAULT 0,
  inserted_at TEXT NOT NULL,
  metadata    TEXT NOT NULL            -- JSON: neutral RawDelivery minus body
);
CREATE INDEX IF NOT EXISTS idx_raw_delivery_body_hash ON raw_delivery (body_hash);

-- ---------------------------------------------------------------------------
-- Dedupe layer 1: DELIVERY-LEVEL. Dedupes a webhook delivery by the platform's
-- delivery identity (Slack event_id, GitHub X-GitHub-Delivery, Telegram
-- update_id, Svix svix-id). Own retention window (~1h). Claimed on the fetch ack
-- path; a re-claim collapses a redelivery to 200 and never re-enqueues.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dedupe_delivery (
  dedupe_key      TEXT PRIMARY KEY,    -- platform-owned native delivery key
  raw_id          TEXT NOT NULL,
  claimed_at      TEXT NOT NULL,
  expires_at      TEXT NOT NULL        -- claimed_at + retentionSeconds
);
CREATE INDEX IF NOT EXISTS idx_dedupe_delivery_expires ON dedupe_delivery (expires_at);

-- ---------------------------------------------------------------------------
-- Dedupe layer 2: MESSAGE-LEVEL. DISTINCT keys and TTLs from the delivery layer
-- and MUST NOT be merged: a redelivery of the same webhook and a re-send of the
-- same logical message are different events. Shorter window (~5m). Keyed by the
-- platform message id (WhatsApp wamid / message_id).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dedupe_message (
  message_key     TEXT PRIMARY KEY,    -- platform message id
  event_id        TEXT NOT NULL,
  claimed_at      TEXT NOT NULL,
  expires_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dedupe_message_expires ON dedupe_message (expires_at);

-- ---------------------------------------------------------------------------
-- Journal: canonical events (append-once on event_id) and runtime records
-- (append-once on record_id). Written by the QUEUE CONSUMER, not the fetch path.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS journal_event (
  event_id        TEXT PRIMARY KEY,
  platform        TEXT NOT NULL,
  raw_id          TEXT NOT NULL,
  native_key      TEXT NOT NULL,
  decoder_version TEXT NOT NULL,
  occurred_at     TEXT NOT NULL,
  tenant          TEXT NOT NULL,
  account         TEXT NOT NULL,
  source          TEXT NOT NULL        -- JSON: EventSource
);
CREATE INDEX IF NOT EXISTS idx_journal_event_raw ON journal_event (raw_id);
CREATE INDEX IF NOT EXISTS idx_journal_event_tenant ON journal_event (tenant, account);

CREATE TABLE IF NOT EXISTS journal_record (
  record_id       TEXT PRIMARY KEY,
  event_id        TEXT NOT NULL,
  runtime_version TEXT NOT NULL,
  produced_at     TEXT NOT NULL,
  decision        TEXT NOT NULL        -- JSON
);
CREATE INDEX IF NOT EXISTS idx_journal_record_event ON journal_record (event_id);

-- ---------------------------------------------------------------------------
-- Outbox: the ONLY side-effect path. Rows are created pending by the consumer;
-- dispatchOutbox sends them honoring the RATE KEY (per-bucket ordering) and the
-- IDEMPOTENCY KEY (a row past "pending" is never re-sent). Replay stays
-- side-effect-free (the dispatcher refuses to send on a dry run).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS outbox (
  outbox_id        TEXT PRIMARY KEY,
  idempotency_key  TEXT NOT NULL UNIQUE,  -- per-artifact idempotency
  platform         TEXT NOT NULL,
  method           TEXT NOT NULL,
  destination      TEXT NOT NULL,
  rate_key         TEXT NOT NULL,         -- platform rate bucket
  request_hash     TEXT NOT NULL,
  request_body     TEXT NOT NULL,         -- JSON
  caused_by_id     TEXT NOT NULL,
  state            TEXT NOT NULL DEFAULT 'pending', -- pending|sent|retry|failed
  attempts         TEXT NOT NULL DEFAULT '[]'       -- JSON: OutboxAttempt[]
);
CREATE INDEX IF NOT EXISTS idx_outbox_state ON outbox (state);
CREATE INDEX IF NOT EXISTS idx_outbox_rate_key ON outbox (rate_key, state);
