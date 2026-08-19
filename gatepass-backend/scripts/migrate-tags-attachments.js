import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pool } from '../src/db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const sql = await readFile(
    join(__dirname, '..', 'db', 'migrate-tags-attachments.sql'),
    'utf8'
  );
  console.log('Applying Tag Print + Attachments migration…');
  await pool.query(sql);
  console.log('✓ Migration complete (plant_tags, delivery_note_attachments).');
  await pool.end();
}

main().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
