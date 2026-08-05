-- ============================================================
-- Acacia LLC — Gate Pass System
-- Postgres schema
-- Run with:  npm run db:setup
-- ============================================================

BEGIN;

DROP TABLE IF EXISTS serials             CASCADE;
DROP TABLE IF EXISTS delivery_note_lines CASCADE;
DROP TABLE IF EXISTS delivery_notes      CASCADE;
DROP TABLE IF EXISTS gate_pass_lines     CASCADE;
DROP TABLE IF EXISTS gate_passes         CASCADE;
DROP TABLE IF EXISTS customers           CASCADE;
DROP TABLE IF EXISTS plants              CASCADE;
DROP TABLE IF EXISTS locations           CASCADE;
DROP TABLE IF EXISTS app_settings        CASCADE;
DROP TABLE IF EXISTS users               CASCADE;

CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'garden')),
  created_by    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  modified_by   TEXT,
  modified_at   TIMESTAMPTZ
);

CREATE TABLE customers (
  id            SERIAL PRIMARY KEY,
  customer_name TEXT NOT NULL,
  party         TEXT NOT NULL DEFAULT 'EXT' CHECK (party IN ('EXT', 'INT')),
  projects      TEXT[] NOT NULL DEFAULT '{}',
  created_by    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  modified_by   TEXT,
  modified_at   TIMESTAMPTZ
);

CREATE TABLE plants (
  id            SERIAL PRIMARY KEY,
  category      TEXT NOT NULL,
  plant_name    TEXT NOT NULL,
  created_by    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  modified_by   TEXT,
  modified_at   TIMESTAMPTZ
);

CREATE TABLE locations (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL UNIQUE,
  created_by    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  modified_by   TEXT,
  modified_at   TIMESTAMPTZ
);

CREATE TABLE app_settings (
  key   TEXT PRIMARY KEY,
  value JSONB NOT NULL
);

INSERT INTO app_settings (key, value) VALUES
  ('number_settings', '{"gpPrefix":"GP-","gpNext":100001,"dnPrefix":"DO-","dnNext":100001}'::jsonb);

CREATE TABLE gate_passes (
  id               SERIAL PRIMARY KEY,
  no               TEXT NOT NULL UNIQUE,
  do_no            TEXT,
  do_date          TEXT,
  lpo_no           TEXT,
  lpo_date         TEXT,
  pr_ref           TEXT,
  so_ref           TEXT,
  customer_name    TEXT NOT NULL,
  customer_code    TEXT,
  project          TEXT,
  party            TEXT,
  assigned_to      TEXT[] NOT NULL DEFAULT '{}',
  created_by       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  modified_by      TEXT,
  modified_at      TIMESTAMPTZ,
  delivery_note_id INTEGER
);

CREATE TABLE gate_pass_lines (
  id            SERIAL PRIMARY KEY,
  gp_id         INTEGER NOT NULL REFERENCES gate_passes(id) ON DELETE CASCADE,
  sl_no         INTEGER NOT NULL,
  plant_code    TEXT,
  plant_desc    TEXT,
  pot_size      TEXT,
  height        TEXT,
  girth         TEXT,
  spread        TEXT,
  unit          TEXT DEFAULT 'Nos',
  qty           INTEGER NOT NULL DEFAULT 0,
  posted_qty    INTEGER NOT NULL DEFAULT 0,
  remaining_qty INTEGER NOT NULL DEFAULT 0,
  location      TEXT
);

CREATE TABLE delivery_notes (
  id               SERIAL PRIMARY KEY,
  no               TEXT NOT NULL UNIQUE,
  gp_id            INTEGER REFERENCES gate_passes(id) ON DELETE SET NULL,
  gp_no            TEXT,
  customer_project TEXT,
  customer_code    TEXT,
  location         TEXT,
  dn_date          TEXT,
  vh_number        TEXT NOT NULL,
  project          TEXT,
  prepared_by      TEXT,
  modified_by      TEXT,
  modified_at      TIMESTAMPTZ,
  status           TEXT NOT NULL DEFAULT 'scanning'
                   CHECK (status IN ('scanning', 'completed')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE delivery_note_lines (
  id            SERIAL PRIMARY KEY,
  dn_id         INTEGER NOT NULL REFERENCES delivery_notes(id) ON DELETE CASCADE,
  sl_no         INTEGER NOT NULL,
  plant_name    TEXT,
  plant_code    TEXT,
  spec          TEXT,
  qty           INTEGER NOT NULL DEFAULT 0,
  delivery_qty  INTEGER NOT NULL DEFAULT 0,
  posted_qty    TEXT DEFAULT '0',
  remaining_qty TEXT DEFAULT '0',
  remarks       TEXT,
  location      TEXT,
  has_split     BOOLEAN NOT NULL DEFAULT false,
  is_pending    BOOLEAN NOT NULL DEFAULT false,
  do_ref        TEXT
);

CREATE TABLE serials (
  id          SERIAL PRIMARY KEY,
  dn_line_id  INTEGER NOT NULL REFERENCES delivery_note_lines(id) ON DELETE CASCADE,
  code        TEXT NOT NULL,
  scanned_by  TEXT,
  scanned_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (dn_line_id, code)
);

CREATE TABLE plant_tags (
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

CREATE UNIQUE INDEX idx_plant_tags_srl_lower ON plant_tags (lower(srl_no));

CREATE TABLE delivery_note_attachments (
  id          SERIAL PRIMARY KEY,
  dn_id       INTEGER NOT NULL REFERENCES delivery_notes(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  mime_type   TEXT NOT NULL DEFAULT '',
  size_bytes  INTEGER NOT NULL DEFAULT 0,
  data_url    TEXT NOT NULL,
  uploaded_by TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE gate_passes
  ADD CONSTRAINT fk_gp_delivery_note
  FOREIGN KEY (delivery_note_id) REFERENCES delivery_notes(id) ON DELETE SET NULL;

CREATE INDEX idx_gp_lines_gp  ON gate_pass_lines (gp_id);
CREATE INDEX idx_dn_lines_dn  ON delivery_note_lines (dn_id);
CREATE INDEX idx_serials_line ON serials (dn_line_id);
CREATE INDEX idx_dn_gp        ON delivery_notes (gp_id);
CREATE INDEX idx_gp_dn        ON gate_passes (delivery_note_id);
CREATE INDEX idx_dn_attachments_dn ON delivery_note_attachments (dn_id);

COMMIT;
