// One-time, additive migration for existing databases: adds the
// `notifications` table without touching anything else. Safe to run against
// a live DB — unlike `npm run db:setup`, which drops and recreates every
// table from schema.sql.
//
// Usage: node scripts/migrate-notifications.js
import { pool } from '../src/db.js';

async function main() {
  console.log('Creating notifications table (if missing)…');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id          SERIAL PRIMARY KEY,
      dn_no       TEXT NOT NULL,
      message     TEXT NOT NULL,
      created_by  TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      read_at     TIMESTAMPTZ
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications (id) WHERE read_at IS NULL;
  `);
  console.log('✓ notifications table ready.');
  await pool.end();
}

main().catch(err => { console.error('Migration failed:', err.message); process.exit(1); });
