import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth, requireRole } from '../auth.js';

const router = Router();
router.use(requireAuth);

function actor(req) {
  return req.user.name || req.user.username;
}

function mapNotification(r) {
  return {
    id: String(r.id),
    dnNo: r.dn_no,
    message: r.message,
    createdBy: r.created_by || '',
    createdAt: r.created_at,
    readAt: r.read_at,
  };
}

// GET /api/notifications — admin-only broadcast log, most recent first.
router.get('/', requireRole('admin'), async (req, res, next) => {
  try {
    const rows = (await pool.query(
      'SELECT * FROM notifications ORDER BY id DESC LIMIT 100'
    )).rows;
    res.json(rows.map(mapNotification));
  } catch (err) {
    next(err);
  }
});

// POST /api/notifications — garden/admin raises one (e.g. after a scan submission).
router.post('/', requireRole('admin', 'garden'), async (req, res, next) => {
  try {
    const dnNo = (req.body?.dnNo ? String(req.body.dnNo) : '').trim();
    const message = (req.body?.message ? String(req.body.message) : '').trim();
    if (!dnNo || !message) return res.status(400).json({ error: 'dnNo and message are required' });

    const row = (await pool.query(
      'INSERT INTO notifications (dn_no, message, created_by) VALUES ($1, $2, $3) RETURNING *',
      [dnNo, message, actor(req)]
    )).rows[0];
    res.status(201).json(mapNotification(row));
  } catch (err) {
    next(err);
  }
});

// PATCH /api/notifications/:id/read
router.patch('/:id/read', requireRole('admin'), async (req, res, next) => {
  try {
    const row = (await pool.query(
      'UPDATE notifications SET read_at = now() WHERE id = $1 RETURNING *',
      [req.params.id]
    )).rows[0];
    if (!row) return res.status(404).json({ error: 'Notification not found' });
    res.json(mapNotification(row));
  } catch (err) {
    next(err);
  }
});

// PATCH /api/notifications/read-all
router.patch('/read-all', requireRole('admin'), async (req, res, next) => {
  try {
    await pool.query('UPDATE notifications SET read_at = now() WHERE read_at IS NULL');
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
