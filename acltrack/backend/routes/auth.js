'use strict';
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { getDb } = require('../db/database');
const { requireAuth, requireAdmin, auditLog } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/login
router.post('/login', auditLog('login', 'users'), async (req, res) => {
  const { email, wachtwoord } = req.body;
  if (!email || !wachtwoord) {
    return res.status(400).json({ error: 'Email en wachtwoord zijn verplicht' });
  }
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE email = ? AND actief = 1').get(email.toLowerCase().trim());
  if (!user) {
    return res.status(401).json({ error: 'Ongeldige inloggegevens' });
  }
  const ok = await bcrypt.compare(wachtwoord, user.wachtwoord);
  if (!ok) {
    return res.status(401).json({ error: 'Ongeldige inloggegevens' });
  }
  db.prepare(`UPDATE users SET laatste_login = datetime('now') WHERE id = ?`).run(user.id);
  const token = jwt.sign(
    { id: user.id, naam: user.naam, email: user.email, rol: user.rol },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES || '8h' }
  );
  res.json({ token, user: { id: user.id, naam: user.naam, email: user.email, rol: user.rol } });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT id, naam, email, rol, aangemaakt, laatste_login FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Gebruiker niet gevonden' });
  res.json(user);
});

// POST /api/auth/wachtwoord
router.post('/wachtwoord', requireAuth, async (req, res) => {
  const { huidig, nieuw } = req.body;
  if (!huidig || !nieuw) {
    return res.status(400).json({ error: 'Huidig en nieuw wachtwoord zijn verplicht' });
  }
  if (nieuw.length < 8) {
    return res.status(400).json({ error: 'Nieuw wachtwoord moet minimaal 8 tekens bevatten' });
  }
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const ok = await bcrypt.compare(huidig, user.wachtwoord);
  if (!ok) {
    return res.status(401).json({ error: 'Huidig wachtwoord is onjuist' });
  }
  const hash = await bcrypt.hash(nieuw, 12);
  db.prepare('UPDATE users SET wachtwoord = ? WHERE id = ?').run(hash, req.user.id);
  res.json({ message: 'Wachtwoord gewijzigd' });
});

// GET /api/auth/gebruikers [admin]
router.get('/gebruikers', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const users = db.prepare('SELECT id, naam, email, rol, actief, aangemaakt, laatste_login FROM users ORDER BY aangemaakt DESC').all();
  res.json(users);
});

// POST /api/auth/gebruikers [admin]
router.post('/gebruikers', requireAuth, requireAdmin, auditLog('create', 'users'), async (req, res) => {
  const { naam, email, wachtwoord, rol } = req.body;
  if (!naam || !email || !wachtwoord) {
    return res.status(400).json({ error: 'Naam, email en wachtwoord zijn verplicht' });
  }
  const geldigeRollen = ['admin', 'fysiotherapeut'];
  const rolFinal = geldigeRollen.includes(rol) ? rol : 'fysiotherapeut';
  const db = getDb();
  const bestaand = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (bestaand) {
    return res.status(409).json({ error: 'Email al in gebruik' });
  }
  const hash = await bcrypt.hash(wachtwoord, 12);
  const result = db.prepare(
    'INSERT INTO users (naam, email, wachtwoord, rol) VALUES (?, ?, ?, ?)'
  ).run(naam, email.toLowerCase().trim(), hash, rolFinal);
  res.status(201).json({ id: result.lastInsertRowid, naam, email, rol: rolFinal });
});

// PATCH /api/auth/gebruikers/:id [admin]
router.patch('/gebruikers/:id', requireAuth, requireAdmin, auditLog('update', 'users'), (req, res) => {
  const { rol, actief } = req.body;
  const db = getDb();
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Gebruiker niet gevonden' });
  if (rol !== undefined) {
    const geldigeRollen = ['admin', 'fysiotherapeut'];
    if (!geldigeRollen.includes(rol)) return res.status(400).json({ error: 'Ongeldige rol' });
    db.prepare('UPDATE users SET rol = ? WHERE id = ?').run(rol, req.params.id);
  }
  if (actief !== undefined) {
    db.prepare('UPDATE users SET actief = ? WHERE id = ?').run(actief ? 1 : 0, req.params.id);
  }
  const updated = db.prepare('SELECT id, naam, email, rol, actief FROM users WHERE id = ?').get(req.params.id);
  res.json(updated);
});

module.exports = router;
