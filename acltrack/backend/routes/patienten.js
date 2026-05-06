'use strict';
const express = require('express');
const { getDb } = require('../db/database');
const { requireAuth, auditLog } = require('../middleware/auth');

const router = express.Router();

// GET /api/patienten
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const { fase, zoek } = req.query;
  let sql = `
    SELECT p.*,
      (SELECT COUNT(*) FROM meetpunten m WHERE m.patient_id = p.id) as meetpunten_count,
      (SELECT MAX(m.datum) FROM meetpunten m WHERE m.patient_id = p.id) as laatste_meetpunt
    FROM patienten p
    WHERE p.actief = 1
  `;
  const params = [];
  if (fase) { sql += ` AND p.fase = ?`; params.push(fase); }
  if (zoek) { sql += ` AND p.naam LIKE ?`; params.push(`%${zoek}%`); }
  sql += ` ORDER BY p.bijgewerkt DESC`;
  res.json(db.prepare(sql).all(...params));
});

// POST /api/patienten
router.post('/', requireAuth, auditLog('create', 'patienten'), (req, res) => {
  const { naam, geboortejaar, geslacht, operatiedatum, graft, zijde, fase, notities } = req.body;
  if (!naam || !operatiedatum || !graft || !zijde) {
    return res.status(400).json({ error: 'Naam, operatiedatum, graft en zijde zijn verplicht' });
  }
  const geldigeGrafts = ['Hamstring', 'Patellapees', 'Quadricepspees', 'Allograft', 'Synthetisch'];
  const geldigeZijdes = ['Links', 'Rechts'];
  const geldige_fasen = ['Pre-op', 'Fase 1', 'Fase 2', 'Fase 3', 'Fase 4', 'Teruggekeerd'];
  if (!geldigeGrafts.includes(graft)) return res.status(400).json({ error: 'Ongeldige graft' });
  if (!geldigeZijdes.includes(zijde)) return res.status(400).json({ error: 'Ongeldige zijde' });
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO patienten (naam, geboortejaar, geslacht, operatiedatum, graft, zijde, fase, notities, aangemaakt_door)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(naam, geboortejaar || null, geslacht || null, operatiedatum, graft, zijde, fase || 'Fase 1', notities || null, req.user.id);
  res.status(201).json({ id: result.lastInsertRowid });
});

// GET /api/patienten/:id
router.get('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const patient = db.prepare('SELECT * FROM patienten WHERE id = ? AND actief = 1').get(req.params.id);
  if (!patient) return res.status(404).json({ error: 'Patiënt niet gevonden' });
  const meetpunten = db.prepare(
    'SELECT * FROM meetpunten WHERE patient_id = ? ORDER BY datum DESC, aangemaakt DESC'
  ).all(req.params.id);
  res.json({ ...patient, meetpunten });
});

// PATCH /api/patienten/:id
router.patch('/:id', requireAuth, auditLog('update', 'patienten'), (req, res) => {
  const db = getDb();
  const patient = db.prepare('SELECT id FROM patienten WHERE id = ? AND actief = 1').get(req.params.id);
  if (!patient) return res.status(404).json({ error: 'Patiënt niet gevonden' });
  const { naam, geboortejaar, geslacht, operatiedatum, graft, zijde, fase, notities } = req.body;
  db.prepare(`
    UPDATE patienten SET
      naam = COALESCE(?, naam),
      geboortejaar = COALESCE(?, geboortejaar),
      geslacht = COALESCE(?, geslacht),
      operatiedatum = COALESCE(?, operatiedatum),
      graft = COALESCE(?, graft),
      zijde = COALESCE(?, zijde),
      fase = COALESCE(?, fase),
      notities = COALESCE(?, notities),
      bijgewerkt = datetime('now')
    WHERE id = ?
  `).run(naam || null, geboortejaar || null, geslacht || null, operatiedatum || null, graft || null, zijde || null, fase || null, notities || null, req.params.id);
  const updated = db.prepare('SELECT * FROM patienten WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// DELETE /api/patienten/:id (soft delete)
router.delete('/:id', requireAuth, auditLog('delete', 'patienten'), (req, res) => {
  const db = getDb();
  const patient = db.prepare('SELECT id FROM patienten WHERE id = ? AND actief = 1').get(req.params.id);
  if (!patient) return res.status(404).json({ error: 'Patiënt niet gevonden' });
  db.prepare(`UPDATE patienten SET actief = 0, bijgewerkt = datetime('now') WHERE id = ?`).run(req.params.id);
  res.json({ message: 'Patiënt verwijderd' });
});

module.exports = router;
