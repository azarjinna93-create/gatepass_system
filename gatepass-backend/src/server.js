import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import { pool } from './db.js';
import authRoutes from './routes/auth.js';
import deliveryNoteRoutes from './routes/deliveryNotes.js';
import gatePassRoutes from './routes/gatePasses.js';
import mastersRoutes from './routes/masters.js';
import plantTagsRoutes from './routes/plantTags.js';
import usersRoutes from './routes/users.js';

dotenv.config();

const app = express();

const origins = (process.env.CORS_ORIGIN || '*').split(',').map(s => s.trim());
app.use(cors({ origin: origins.includes('*') ? true : origins }));
// Attachments are stored as data URLs — allow larger JSON bodies.
app.use(express.json({ limit: '12mb' }));

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, db: 'up' });
  } catch {
    res.status(503).json({ ok: false, db: 'down' });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/gate-passes', gatePassRoutes);
app.use('/api/delivery-notes', deliveryNoteRoutes);
app.use('/api/masters', mastersRoutes);
app.use('/api/plant-tags', plantTagsRoutes);
app.use('/api/users', usersRoutes);

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = Number(process.env.PORT || 4000);
app.listen(PORT, () => {
  console.log(`Acacia Gate Pass API listening on http://localhost:${PORT}`);
});
