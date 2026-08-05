import { Router } from 'express';
import { pool, withTransaction } from '../db.js';
import { requireAuth, requireRole } from '../auth.js';

const router = Router();
router.use(requireAuth);

function formatDate(d) {
  if (!d) return null;
  if (typeof d === 'string' && /^\d{2}-\d{2}-\d{4}$/.test(d)) return d;
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return String(d);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(dt.getDate())}-${pad(dt.getMonth() + 1)}-${dt.getFullYear()}`;
}

function actor(req) {
  return req.user.name || req.user.username;
}

function specOf(l) {
  const a = [];
  if (l.pot_size) a.push(l.pot_size);
  if (l.height) a.push('H' + l.height);
  if (l.girth) a.push(l.girth);
  return a.join(', ');
}

async function loadAttachments(client, dnId) {
  const { rows } = await client.query(
    'SELECT * FROM delivery_note_attachments WHERE dn_id = $1 ORDER BY id',
    [dnId]
  );
  return rows.map((a) => ({
    id: String(a.id),
    name: a.name || '',
    type: a.mime_type || '',
    size: Number(a.size_bytes) || 0,
    dataUrl: a.data_url || '',
    uploadedBy: a.uploaded_by || '',
    uploadedAt: formatDate(a.uploaded_at) || '',
  }));
}

async function loadDeliveryNote(client, dnId) {
  const dn = (await client.query('SELECT * FROM delivery_notes WHERE id = $1', [dnId])).rows[0];
  if (!dn) return null;
  const lines = (await client.query(
    'SELECT * FROM delivery_note_lines WHERE dn_id = $1 ORDER BY sl_no',
    [dnId]
  )).rows;
  const out = [];
  for (const l of lines) {
    const serials = (await client.query(
      'SELECT code FROM serials WHERE dn_line_id = $1 ORDER BY id',
      [l.id]
    )).rows.map(r => r.code);
    out.push({
      slNo: l.sl_no,
      plantName: l.plant_name || '',
      plantCode: l.plant_code || '',
      spec: l.spec || '',
      qty: Number(l.qty) || 0,
      deliveryQty: Number(l.delivery_qty) || 0,
      postedQty: l.posted_qty != null ? String(l.posted_qty) : '0',
      remainingQty: l.remaining_qty != null ? String(l.remaining_qty) : '0',
      remarks: l.remarks || '',
      location: l.location || '',
      hasSplit: !!l.has_split,
      isPending: !!l.is_pending,
      doRef: l.do_ref || '',
      serials,
    });
  }
  let attachments = [];
  try {
    attachments = await loadAttachments(client, dnId);
  } catch (err) {
    // Table may not exist until migration is applied
    if (err.code !== '42P01') throw err;
  }
  return {
    no: dn.no,
    gpNo: dn.gp_no || '',
    customerProject: dn.customer_project || '',
    customerCode: dn.customer_code || '',
    location: dn.location || '',
    date: dn.dn_date || '',
    vhNumber: dn.vh_number || '',
    project: dn.project || '',
    preparedBy: dn.prepared_by || '',
    modifiedBy: dn.modified_by || null,
    modifiedAt: dn.modified_at ? formatDate(dn.modified_at) : null,
    status: dn.status,
    createdAt: formatDate(dn.created_at) || '',
    lines: out,
    attachments,
  };
}

async function nextDnNo(client) {
  const { rows } = await client.query(
    `SELECT value FROM app_settings WHERE key = 'number_settings' FOR UPDATE`
  );
  const settings = rows[0]?.value || { dnPrefix: 'DO-', dnNext: 100001 };
  const prefix = settings.dnPrefix || 'DO-';
  const next = Number(settings.dnNext) || 100001;
  const no = `${prefix}${String(next).padStart(6, '0')}`;
  await client.query(
    `UPDATE app_settings SET value = $1 WHERE key = 'number_settings'`,
    [JSON.stringify({ ...settings, dnNext: next + 1 })]
  );
  return no;
}

async function getDnLine(client, dnId, slNo) {
  return (await client.query(
    'SELECT * FROM delivery_note_lines WHERE dn_id = $1 AND sl_no = $2',
    [dnId, Number(slNo)]
  )).rows[0];
}

async function touchDn(client, dnId, modifiedBy) {
  await client.query(
    `UPDATE delivery_notes SET modified_by = $1, modified_at = now() WHERE id = $2`,
    [modifiedBy, dnId]
  );
}

// GET /api/delivery-notes
router.get('/', async (req, res, next) => {
  try {
    const ids = (await pool.query('SELECT id FROM delivery_notes ORDER BY id DESC')).rows.map(r => r.id);
    const out = [];
    for (const id of ids) out.push(await loadDeliveryNote(pool, id));
    res.json(out);
  } catch (err) { next(err); }
});

// GET /api/delivery-notes/:no
router.get('/:no', async (req, res, next) => {
  try {
    const row = (await pool.query('SELECT id FROM delivery_notes WHERE no = $1', [req.params.no])).rows[0];
    if (!row) return res.status(404).json({ error: 'Delivery note not found' });
    res.json(await loadDeliveryNote(pool, row.id));
  } catch (err) { next(err); }
});

// POST /api/delivery-notes
router.post('/', requireRole('admin', 'garden'), async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!b.gpNo) return res.status(400).json({ error: 'gpNo is required' });
    if (!b.vhNumber?.trim()) return res.status(400).json({ error: 'vhNumber is required' });

    const dn = await withTransaction(async c => {
      const gp = (await c.query('SELECT * FROM gate_passes WHERE no = $1', [b.gpNo])).rows[0];
      if (!gp) throw Object.assign(new Error('Gate pass not found'), { status: 404 });
      if (gp.delivery_note_id) {
        throw Object.assign(new Error('This gate pass already has a delivery note'), { status: 409 });
      }

      const gpLines = (await c.query(
        'SELECT * FROM gate_pass_lines WHERE gp_id = $1 ORDER BY sl_no',
        [gp.id]
      )).rows;

      const overrides = {};
      for (const ln of b.lines || []) overrides[ln.slNo] = ln;

      const headerLocation = (b.location && String(b.location).trim())
        || (b.lines || []).map(l => l.location).find(x => x && String(x).trim())
        || gpLines.map(l => l.location).find(x => x && String(x).trim())
        || null;

      const no = await nextDnNo(c);
      const ins = await c.query(
        `INSERT INTO delivery_notes
           (no, gp_id, gp_no, customer_project, customer_code, location, dn_date, vh_number, project, prepared_by, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'scanning') RETURNING id`,
        [
          no, gp.id, gp.no,
          b.customerProject || gp.customer_name,
          gp.customer_code,
          headerLocation,
          b.date || null,
          b.vhNumber,
          b.project || gp.project || gp.customer_name,
          actor(req),
        ]
      );
      const dnId = ins.rows[0].id;

      for (const l of gpLines) {
        const ov = overrides[l.sl_no] || {};
        const deliveryQty = ov.deliveryQty != null ? Number(ov.deliveryQty) : Number(l.qty) || 0;
        const lineLocation = ov.location || l.location || headerLocation || null;
        await c.query(
          `INSERT INTO delivery_note_lines
             (dn_id, sl_no, plant_name, plant_code, spec, qty, delivery_qty,
              posted_qty, remaining_qty, remarks, location, has_split, is_pending, do_ref)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'0','0',$8,$9,false,false,null)`,
          [
            dnId, l.sl_no,
            l.plant_desc || l.plant_code,
            l.plant_code,
            specOf(l),
            Number(l.qty) || 0,
            deliveryQty,
            ov.remarks || null,
            lineLocation,
          ]
        );
      }

      await c.query('UPDATE gate_passes SET delivery_note_id = $1 WHERE id = $2', [dnId, gp.id]);
      return loadDeliveryNote(c, dnId);
    });
    res.status(201).json(dn);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// PATCH /api/delivery-notes/:no/header
router.patch('/:no/header', requireRole('admin', 'garden'), async (req, res, next) => {
  try {
    const b = req.body || {};
    const result = await withTransaction(async c => {
      const dn = (await c.query('SELECT * FROM delivery_notes WHERE no = $1', [req.params.no])).rows[0];
      if (!dn) throw Object.assign(new Error('Delivery note not found'), { status: 404 });
      await c.query(
        `UPDATE delivery_notes SET
           customer_project = $1, vh_number = $2, project = $3, dn_date = $4,
           modified_by = $5, modified_at = now()
         WHERE id = $6`,
        [
          b.customerProject ?? dn.customer_project,
          b.vhNumber ?? dn.vh_number,
          b.project ?? dn.project,
          b.date ?? dn.dn_date,
          actor(req),
          dn.id,
        ]
      );
      return loadDeliveryNote(c, dn.id);
    });
    res.json(result);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// PATCH /api/delivery-notes/:no/lines/:slNo
router.patch('/:no/lines/:slNo', requireRole('admin', 'garden'), async (req, res, next) => {
  try {
    const b = req.body || {};
    const keys = Object.keys(b);
    const onlyDoRef = keys.length === 1 && keys[0] === 'doRef';

    const result = await withTransaction(async c => {
      const dn = (await c.query('SELECT * FROM delivery_notes WHERE no = $1', [req.params.no])).rows[0];
      if (!dn) throw Object.assign(new Error('Delivery note not found'), { status: 404 });
      const line = await getDnLine(c, dn.id, req.params.slNo);
      if (!line) throw Object.assign(new Error('Delivery note line not found'), { status: 404 });

      if (onlyDoRef) {
        await c.query(
          `UPDATE delivery_note_lines SET do_ref = $1 WHERE id = $2`,
          [b.doRef ?? '', line.id]
        );
      } else {
        const postedQty = b.postedQty != null ? String(b.postedQty) : String(line.posted_qty ?? '0');
        const posted = Number(postedQty) || 0;
        const target = Number(line.delivery_qty) || 0;
        const remainingQty = String(Math.max(0, target - posted));
        await c.query(
          `UPDATE delivery_note_lines SET posted_qty = $1, remaining_qty = $2, remarks = $3 WHERE id = $4`,
          [postedQty, remainingQty, b.remarks != null ? b.remarks : (line.remarks || ''), line.id]
        );
      }
      await touchDn(c, dn.id, actor(req));
      return loadDeliveryNote(c, dn.id);
    });
    res.json(result);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// POST /api/delivery-notes/:no/lines/:slNo/split
router.post('/:no/lines/:slNo/split', requireRole('admin', 'garden'), async (req, res, next) => {
  try {
    const result = await withTransaction(async c => {
      const dn = (await c.query('SELECT * FROM delivery_notes WHERE no = $1', [req.params.no])).rows[0];
      if (!dn) throw Object.assign(new Error('Delivery note not found'), { status: 404 });
      const line = await getDnLine(c, dn.id, req.params.slNo);
      if (!line) throw Object.assign(new Error('Delivery note line not found'), { status: 404 });
      if (line.has_split) throw Object.assign(new Error('This line has already been split'), { status: 409 });

      const posted = Number(line.posted_qty) || 0;
      const shortfall = (Number(line.delivery_qty) || 0) - posted;
      if (shortfall <= 0) {
        throw Object.assign(new Error('Nothing to split — line is already fully posted'), { status: 409 });
      }

      await c.query(`UPDATE delivery_note_lines SET has_split = true WHERE id = $1`, [line.id]);
      const nextSl = Number(
        (await c.query('SELECT COALESCE(MAX(sl_no), 0) AS m FROM delivery_note_lines WHERE dn_id = $1', [dn.id])).rows[0].m
      ) + 1;

      await c.query(
        `INSERT INTO delivery_note_lines
           (dn_id, sl_no, plant_name, plant_code, spec, qty, delivery_qty,
            posted_qty, remaining_qty, remarks, location, has_split, is_pending, do_ref)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'0',$8,'',$9,false,true,null)`,
        [
          dn.id, nextSl,
          line.plant_name, line.plant_code, line.spec,
          shortfall, shortfall, String(shortfall),
          line.location,
        ]
      );
      await touchDn(c, dn.id, actor(req));
      return loadDeliveryNote(c, dn.id);
    });
    res.status(201).json(result);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// DELETE /api/delivery-notes/:no/lines/:slNo
router.delete('/:no/lines/:slNo', requireRole('admin', 'garden'), async (req, res, next) => {
  try {
    const result = await withTransaction(async c => {
      const dn = (await c.query('SELECT * FROM delivery_notes WHERE no = $1', [req.params.no])).rows[0];
      if (!dn) throw Object.assign(new Error('Delivery note not found'), { status: 404 });
      const line = await getDnLine(c, dn.id, req.params.slNo);
      if (!line) throw Object.assign(new Error('Delivery note line not found'), { status: 404 });

      const lineCount = Number(
        (await c.query('SELECT COUNT(*)::int AS n FROM delivery_note_lines WHERE dn_id = $1', [dn.id])).rows[0].n
      );
      if (lineCount <= 1) {
        throw Object.assign(new Error('A delivery note must have at least one line'), { status: 409 });
      }

      const serialCount = Number(
        (await c.query('SELECT COUNT(*)::int AS n FROM serials WHERE dn_line_id = $1', [line.id])).rows[0].n
      );
      if (serialCount > 0) {
        throw Object.assign(
          new Error('Cannot remove — barcodes have already been scanned against this line'),
          { status: 409 }
        );
      }

      await c.query('DELETE FROM delivery_note_lines WHERE id = $1', [line.id]);
      await touchDn(c, dn.id, actor(req));
      return loadDeliveryNote(c, dn.id);
    });
    res.json(result);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// POST /api/delivery-notes/:no/lines/:slNo/serials
router.post('/:no/lines/:slNo/serials', requireRole('admin', 'garden'), async (req, res, next) => {
  try {
    const code = (req.body?.code ? String(req.body.code) : '').trim();
    if (!code) return res.status(400).json({ error: 'code is required' });

    const result = await withTransaction(async c => {
      const dn = (await c.query('SELECT * FROM delivery_notes WHERE no = $1', [req.params.no])).rows[0];
      if (!dn) throw Object.assign(new Error('Delivery note not found'), { status: 404 });
      if (dn.status === 'completed') {
        throw Object.assign(new Error('Delivery note is already completed'), { status: 409 });
      }
      const line = await getDnLine(c, dn.id, req.params.slNo);
      if (!line) throw Object.assign(new Error('Delivery note line not found'), { status: 404 });
      const count = Number(
        (await c.query('SELECT COUNT(*)::int AS n FROM serials WHERE dn_line_id = $1', [line.id])).rows[0].n
      );
      if (count >= line.delivery_qty) {
        throw Object.assign(new Error('This line is already fully scanned'), { status: 409 });
      }
      try {
        await c.query(
          'INSERT INTO serials (dn_line_id, code, scanned_by) VALUES ($1,$2,$3)',
          [line.id, code, actor(req)]
        );
      } catch (e) {
        if (e.code === '23505') throw Object.assign(new Error('Duplicate barcode: ' + code), { status: 409 });
        throw e;
      }
      await touchDn(c, dn.id, actor(req));
      return loadDeliveryNote(c, dn.id);
    });
    res.status(201).json(result);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// DELETE /api/delivery-notes/:no/lines/:slNo/serials/:code
router.delete('/:no/lines/:slNo/serials/:code', requireRole('admin', 'garden'), async (req, res, next) => {
  try {
    const result = await withTransaction(async c => {
      const dn = (await c.query('SELECT * FROM delivery_notes WHERE no = $1', [req.params.no])).rows[0];
      if (!dn) throw Object.assign(new Error('Delivery note not found'), { status: 404 });
      if (dn.status === 'completed') {
        throw Object.assign(new Error('Delivery note is already completed'), { status: 409 });
      }
      const line = await getDnLine(c, dn.id, req.params.slNo);
      if (!line) throw Object.assign(new Error('Delivery note line not found'), { status: 404 });
      await c.query('DELETE FROM serials WHERE dn_line_id = $1 AND code = $2', [line.id, req.params.code]);
      await touchDn(c, dn.id, actor(req));
      return loadDeliveryNote(c, dn.id);
    });
    res.json(result);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// POST /api/delivery-notes/:no/complete
router.post('/:no/complete', requireRole('admin', 'garden'), async (req, res, next) => {
  try {
    const result = await withTransaction(async c => {
      const dn = (await c.query('SELECT * FROM delivery_notes WHERE no = $1', [req.params.no])).rows[0];
      if (!dn) throw Object.assign(new Error('Delivery note not found'), { status: 404 });
      const short = (await c.query(
        `SELECT dnl.sl_no FROM delivery_note_lines dnl
           LEFT JOIN serials s ON s.dn_line_id = dnl.id
          WHERE dnl.dn_id = $1
          GROUP BY dnl.id, dnl.delivery_qty
         HAVING COUNT(s.id) < dnl.delivery_qty`,
        [dn.id]
      )).rows;
      if (short.length) {
        throw Object.assign(new Error('Cannot complete — some lines are not fully scanned'), { status: 409 });
      }
      await c.query(
        `UPDATE delivery_notes SET status = 'completed', modified_by = $1, modified_at = now() WHERE id = $2`,
        [actor(req), dn.id]
      );
      return loadDeliveryNote(c, dn.id);
    });
    res.json(result);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024; // 8 MB

// POST /api/delivery-notes/:no/attachments
router.post('/:no/attachments', requireRole('admin', 'garden'), async (req, res, next) => {
  try {
    const b = req.body || {};
    const name = b.name != null ? String(b.name).trim() : '';
    const dataUrl = b.dataUrl != null ? String(b.dataUrl) : '';
    const size = Number(b.size) || 0;
    if (!name) return res.status(400).json({ error: 'Attachment name is required' });
    if (!dataUrl.startsWith('data:')) {
      return res.status(400).json({ error: 'Attachment dataUrl is required' });
    }
    if (size > MAX_ATTACHMENT_BYTES || dataUrl.length > MAX_ATTACHMENT_BYTES * 1.4) {
      return res.status(400).json({ error: 'Attachment is too large (max 8 MB)' });
    }

    const result = await withTransaction(async (c) => {
      const dn = (await c.query('SELECT * FROM delivery_notes WHERE no = $1', [req.params.no])).rows[0];
      if (!dn) throw Object.assign(new Error('Delivery note not found'), { status: 404 });
      await c.query(
        `INSERT INTO delivery_note_attachments
           (dn_id, name, mime_type, size_bytes, data_url, uploaded_by)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          dn.id,
          name,
          b.type != null ? String(b.type) : '',
          size,
          dataUrl,
          actor(req),
        ]
      );
      await touchDn(c, dn.id, actor(req));
      return loadDeliveryNote(c, dn.id);
    });
    res.status(201).json(result);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// DELETE /api/delivery-notes/:no/attachments/:attachmentId
router.delete('/:no/attachments/:attachmentId', requireRole('admin', 'garden'), async (req, res, next) => {
  try {
    const result = await withTransaction(async (c) => {
      const dn = (await c.query('SELECT * FROM delivery_notes WHERE no = $1', [req.params.no])).rows[0];
      if (!dn) throw Object.assign(new Error('Delivery note not found'), { status: 404 });
      const del = await c.query(
        `DELETE FROM delivery_note_attachments
          WHERE dn_id = $1 AND id = $2
          RETURNING id`,
        [dn.id, Number(req.params.attachmentId)]
      );
      if (!del.rows[0]) throw Object.assign(new Error('Attachment not found'), { status: 404 });
      await touchDn(c, dn.id, actor(req));
      return loadDeliveryNote(c, dn.id);
    });
    res.json(result);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

export default router;
export { loadDeliveryNote };
