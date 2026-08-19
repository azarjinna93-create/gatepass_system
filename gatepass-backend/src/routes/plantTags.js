import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth, requireRole } from '../auth.js';

const router = Router();
router.use(requireAuth);

function formatDate(d) {
  if (!d) return '';
  if (typeof d === 'string' && /^\d{2}-\d{2}-\d{4}$/.test(d)) return d;
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return String(d);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(dt.getDate())}-${pad(dt.getMonth() + 1)}-${dt.getFullYear()}`;
}

function actor(req) {
  return req.user.name || req.user.username;
}

function mapTag(r) {
  return {
    id: String(r.id),
    plantCode: r.plant_code || '',
    plantName: r.plant_name || '',
    srlNo: r.srl_no || '',
    size: r.size || '',
    location: r.location || '',
    warehouse: r.warehouse || '',
    createdBy: r.created_by || '',
    createdAt: formatDate(r.created_at),
  };
}

// GET /api/plant-tags
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM plant_tags ORDER BY id DESC');
    res.json(rows.map(mapTag));
  } catch (err) {
    next(err);
  }
});

// POST /api/plant-tags
router.post('/', requireRole('admin', 'garden'), async (req, res, next) => {
  try {
    const b = req.body || {};
    const srlNo = b.srlNo != null ? String(b.srlNo).trim() : '';
    if (!srlNo) return res.status(400).json({ error: 'SRL# is required' });
    if (!b.plantName || !String(b.plantName).trim()) {
      return res.status(400).json({ error: 'Plant Name is required' });
    }

    try {
      const { rows } = await pool.query(
        `INSERT INTO plant_tags
           (plant_code, plant_name, srl_no, size, location, warehouse, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING *`,
        [
          b.plantCode != null ? String(b.plantCode).trim() : '',
          String(b.plantName).trim(),
          srlNo,
          b.size != null ? String(b.size).trim() : '',
          b.location != null ? String(b.location).trim() : '',
          b.warehouse != null ? String(b.warehouse).trim() : '',
          actor(req),
        ]
      );
      res.status(201).json(mapTag(rows[0]));
    } catch (e) {
      if (e.code === '23505') {
        return res.status(409).json({ error: `SRL# ${srlNo} is already tagged` });
      }
      throw e;
    }
  } catch (err) {
    next(err);
  }
});

export default router;
