'use strict';
const jwt = require('jsonwebtoken');
const { getDb } = require('../db/database');

function requireAuth(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Niet geauthenticeerd' });
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Ongeldig of verlopen token' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.rol !== 'admin') {
    return res.status(403).json({ error: 'Alleen toegankelijk voor beheerders' });
  }
  next();
}

function auditLog(actie, tabel) {
  return (req, res, next) => {
    res.on('finish', () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        try {
          const db = getDb();
          const recordId = req.params.id ? parseInt(req.params.id) : null;
          db.prepare(
            `INSERT INTO audit_log (user_id, actie, tabel, record_id, details, ip_adres)
             VALUES (?, ?, ?, ?, ?, ?)`
          ).run(
            req.user?.id || null,
            actie,
            tabel,
            recordId,
            JSON.stringify({ body: req.body, method: req.method }),
            req.ip
          );
        } catch {}
      }
    });
    next();
  };
}

module.exports = { requireAuth, requireAdmin, auditLog };
