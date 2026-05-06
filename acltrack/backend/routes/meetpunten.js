'use strict';
const express = require('express');
const { getDb } = require('../db/database');
const { requireAuth, auditLog } = require('../middleware/auth');

const router = express.Router({ mergeParams: true });

const MEETPUNT_VELDEN = [
  'kracht_pct', 'stabiliteit_pct', 'bewegingsuitslag_gr', 'spiermassa_pct',
  'quad_ham_ratio', 'single_leg_hop_pct', 'balans_score', 'zwelling_cm',
  'looppatroon_score', 'sportbelasting_pct', 'pijn_score', 'koos_score',
  'ikdc_score', 'lysholm_score', 'vertrouwen_score', 'rts_bereidheid', 'notities'
];

// POST /api/patienten/:id/meetpunten
router.post('/', requireAuth, auditLog('create', 'meetpunten'), (req, res) => {
  const db = getDb();
  const patient = db.prepare('SELECT id FROM patienten WHERE id = ? AND actief = 1').get(req.params.id);
  if (!patient) return res.status(404).json({ error: 'Patiënt niet gevonden' });
  const { datum, week_na_operatie, ...rest } = req.body;
  if (!datum || week_na_operatie === undefined) {
    return res.status(400).json({ error: 'Datum en week na operatie zijn verplicht' });
  }
  const velden = ['patient_id', 'datum', 'week_na_operatie', 'geregistreerd_door', ...MEETPUNT_VELDEN.filter(v => rest[v] !== undefined)];
  const values = [req.params.id, datum, week_na_operatie, req.user.id, ...MEETPUNT_VELDEN.filter(v => rest[v] !== undefined).map(v => rest[v])];
  const placeholders = velden.map(() => '?').join(', ');
  const result = db.prepare(`INSERT INTO meetpunten (${velden.join(', ')}) VALUES (${placeholders})`).run(...values);
  const meetpunt = db.prepare('SELECT * FROM meetpunten WHERE id = ?').get(result.lastInsertRowid);
  db.prepare(`UPDATE patienten SET bijgewerkt = datetime('now') WHERE id = ?`).run(req.params.id);
  res.status(201).json(meetpunt);
});

// PATCH /api/patienten/:id/meetpunten/:mid
router.patch('/:mid', requireAuth, auditLog('update', 'meetpunten'), (req, res) => {
  const db = getDb();
  const meetpunt = db.prepare('SELECT id FROM meetpunten WHERE id = ? AND patient_id = ?').get(req.params.mid, req.params.id);
  if (!meetpunt) return res.status(404).json({ error: 'Meetpunt niet gevonden' });
  const teUpdaten = [...MEETPUNT_VELDEN, 'datum', 'week_na_operatie'].filter(v => req.body[v] !== undefined);
  if (teUpdaten.length === 0) return res.status(400).json({ error: 'Geen velden om bij te werken' });
  const sets = teUpdaten.map(v => `${v} = ?`).join(', ');
  const values = [...teUpdaten.map(v => req.body[v]), req.params.mid];
  db.prepare(`UPDATE meetpunten SET ${sets} WHERE id = ?`).run(...values);
  const updated = db.prepare('SELECT * FROM meetpunten WHERE id = ?').get(req.params.mid);
  res.json(updated);
});

// DELETE /api/patienten/:id/meetpunten/:mid
router.delete('/:mid', requireAuth, auditLog('delete', 'meetpunten'), (req, res) => {
  const db = getDb();
  const meetpunt = db.prepare('SELECT id FROM meetpunten WHERE id = ? AND patient_id = ?').get(req.params.mid, req.params.id);
  if (!meetpunt) return res.status(404).json({ error: 'Meetpunt niet gevonden' });
  db.prepare('DELETE FROM meetpunten WHERE id = ?').run(req.params.mid);
  res.json({ message: 'Meetpunt verwijderd' });
});

module.exports = router;
