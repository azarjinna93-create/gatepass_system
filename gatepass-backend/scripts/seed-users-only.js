import bcrypt from 'bcryptjs';
import { pool, withTransaction } from '../src/db.js';

const USERS = [
  { username: 'admin', password: 'admin123', display_name: 'Admin User', role: 'admin' },
  { username: 'garden', password: 'garden123', display_name: 'Garden Incharge', role: 'garden' },
];

const LOCATIONS = ['MARNUR', 'MFNUR', 'KJNUR', 'RAK 1', 'RAK 2', 'NZ 1', 'NZ 2', 'NZ 3'];

async function main() {
  await withTransaction(async (c) => {
    for (const u of USERS) {
      const hash = await bcrypt.hash(u.password, 10);
      await c.query(
        `INSERT INTO users (username, password_hash, display_name, role, created_by)
         VALUES ($1,$2,$3,$4,'System')
         ON CONFLICT (username) DO UPDATE
           SET password_hash = EXCLUDED.password_hash,
               display_name  = EXCLUDED.display_name,
               role          = EXCLUDED.role`,
        [u.username, hash, u.display_name, u.role]
      );
    }

    for (const name of LOCATIONS) {
      await c.query(
        `INSERT INTO locations (name, created_by)
         VALUES ($1,'Admin User')
         ON CONFLICT (name) DO NOTHING`,
        [name]
      );
    }

    await c.query(
      `UPDATE app_settings
       SET value = $1::jsonb
       WHERE key = 'number_settings'`,
      [JSON.stringify({ gpPrefix: 'GP-', gpNext: 100001, dnPrefix: 'DO-', dnNext: 100001 })]
    );
  });

  const gp = await pool.query('select count(*)::int as n from gate_passes');
  const dn = await pool.query('select count(*)::int as n from delivery_notes');
  console.log(`✓ Users: admin/admin123, garden/garden123`);
  console.log(`✓ Locations: ${LOCATIONS.length}`);
  console.log(`✓ gate_passes=${gp.rows[0].n}, delivery_notes=${dn.rows[0].n}`);
  await pool.end();
}

main().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
