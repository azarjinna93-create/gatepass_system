-- Additive migration: Tag Print + Delivery Note attachments (safe for live DB).
-- Does NOT drop existing data.

BEGIN;

CREATE TABLE IF NOT EXISTS plant_tags (
  id          SERIAL PRIMARY KEY,
  plant_code  TEXT NOT NULL DEFAULT '',
  plant_name  TEXT NOT NULL DEFAULT '',
  srl_no      TEXT NOT NULL,
  size        TEXT NOT NULL DEFAULT '',
  location    TEXT NOT NULL DEFAULT '',
  warehouse   TEXT NOT NULL DEFAULT '',
  created_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_plant_tags_srl_lower ON plant_tags (lower(srl_no));

CREATE TABLE IF NOT EXISTS delivery_note_attachments (
  id          SERIAL PRIMARY KEY,
  dn_id       INTEGER NOT NULL REFERENCES delivery_notes(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  mime_type   TEXT NOT NULL DEFAULT '',
  size_bytes  INTEGER NOT NULL DEFAULT 0,
  data_url    TEXT NOT NULL,
  uploaded_by TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dn_attachments_dn ON delivery_note_attachments (dn_id);

COMMIT;
