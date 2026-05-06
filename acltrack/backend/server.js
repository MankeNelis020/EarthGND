'use strict';
require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { initDb } = require('./db/init');

const authRoutes = require('./routes/auth');
const patientenRoutes = require('./routes/patienten');
const meetpuntenRoutes = require('./routes/meetpunten');
const { getDb } = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3001;

app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Te veel inlogpogingen, probeer het over 15 minuten opnieuw' },
  standardHeaders: true,
  legacyHeaders: false
});

app.use('/api/auth/login', loginLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/patienten', patientenRoutes);
app.use('/api/patienten/:id/meetpunten', meetpuntenRoutes);

// Statistieken endpoint
app.get('/api/statistieken', require('./middleware/auth').requireAuth, (req, res) => {
  const db = getDb();

  const totaalPatienten = db.prepare('SELECT COUNT(*) as count FROM patienten WHERE actief = 1').get();
  const faseVerdeling = db.prepare(`
    SELECT fase, COUNT(*) as count FROM patienten WHERE actief = 1 GROUP BY fase
  `).all();
  const graftVerdeling = db.prepare(`
    SELECT graft, COUNT(*) as count FROM patienten WHERE actief = 1 GROUP BY graft
  `).all();
  const gemiddelden = db.prepare(`
    SELECT
      AVG(kracht_pct) as gem_kracht,
      AVG(stabiliteit_pct) as gem_stabiliteit,
      AVG(pijn_score) as gem_pijn,
      AVG(koos_score) as gem_koos,
      AVG(ikdc_score) as gem_ikdc,
      AVG(lysholm_score) as gem_lysholm,
      AVG(bewegingsuitslag_gr) as gem_rom,
      AVG(vertrouwen_score) as gem_vertrouwen,
      AVG(rts_bereidheid) as gem_rts
    FROM meetpunten m
    JOIN patienten p ON m.patient_id = p.id
    WHERE p.actief = 1
  `).get();

  const gemPerFase = db.prepare(`
    SELECT p.fase,
      AVG(m.kracht_pct) as gem_kracht,
      AVG(m.stabiliteit_pct) as gem_stabiliteit,
      AVG(m.pijn_score) as gem_pijn,
      AVG(m.koos_score) as gem_koos,
      COUNT(DISTINCT m.patient_id) as patient_count
    FROM meetpunten m
    JOIN patienten p ON m.patient_id = p.id
    WHERE p.actief = 1
    GROUP BY p.fase
  `).all();

  const herstelCurve = db.prepare(`
    SELECT week_na_operatie,
      AVG(kracht_pct) as gem_kracht,
      AVG(pijn_score) as gem_pijn,
      AVG(koos_score) as gem_koos,
      AVG(stabiliteit_pct) as gem_stabiliteit,
      COUNT(*) as meetpunten_count
    FROM meetpunten m
    JOIN patienten p ON m.patient_id = p.id
    WHERE p.actief = 1
    GROUP BY week_na_operatie
    ORDER BY week_na_operatie
  `).all();

  res.json({
    totaalPatienten: totaalPatienten.count,
    faseVerdeling,
    graftVerdeling,
    gemiddelden,
    gemPerFase,
    herstelCurve
  });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Interne serverfout' });
});

async function start() {
  await initDb();
  app.listen(PORT, () => {
    console.log(`ACLTrack backend gestart op poort ${PORT}`);
  });
}

start().catch(err => {
  console.error('Fout bij opstarten:', err);
  process.exit(1);
});
