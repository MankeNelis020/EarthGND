'use strict';
const bcrypt = require('bcrypt');
const { getDb } = require('./database');

async function initDb() {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      naam          TEXT NOT NULL,
      email         TEXT NOT NULL UNIQUE,
      wachtwoord    TEXT NOT NULL,
      rol           TEXT DEFAULT 'fysiotherapeut',
      actief        INTEGER DEFAULT 1,
      aangemaakt    TEXT DEFAULT (datetime('now')),
      laatste_login TEXT
    );

    CREATE TABLE IF NOT EXISTS patienten (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      naam            TEXT NOT NULL,
      geboortejaar    INTEGER,
      geslacht        TEXT,
      operatiedatum   TEXT NOT NULL,
      graft           TEXT NOT NULL,
      zijde           TEXT NOT NULL,
      fase            TEXT DEFAULT 'Fase 1',
      notities        TEXT,
      aangemaakt_door INTEGER REFERENCES users(id),
      aangemaakt      TEXT DEFAULT (datetime('now')),
      bijgewerkt      TEXT DEFAULT (datetime('now')),
      actief          INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS meetpunten (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id            INTEGER NOT NULL REFERENCES patienten(id) ON DELETE CASCADE,
      datum                 TEXT NOT NULL,
      week_na_operatie      INTEGER NOT NULL,
      kracht_pct            REAL,
      stabiliteit_pct       REAL,
      bewegingsuitslag_gr   REAL,
      spiermassa_pct        REAL,
      quad_ham_ratio        REAL,
      single_leg_hop_pct    REAL,
      balans_score          REAL,
      zwelling_cm           REAL,
      looppatroon_score     REAL,
      sportbelasting_pct    REAL,
      pijn_score            INTEGER,
      koos_score            REAL,
      ikdc_score            REAL,
      lysholm_score         REAL,
      vertrouwen_score      INTEGER,
      rts_bereidheid        INTEGER,
      geregistreerd_door    INTEGER REFERENCES users(id),
      aangemaakt            TEXT DEFAULT (datetime('now')),
      notities              TEXT
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER REFERENCES users(id),
      actie       TEXT NOT NULL,
      tabel       TEXT,
      record_id   INTEGER,
      details     TEXT,
      ip_adres    TEXT,
      tijdstip    TEXT DEFAULT (datetime('now'))
    );
  `);

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get('admin@praktijk.nl');
  if (!existing) {
    const hash = await bcrypt.hash('WijzigDitWachtwoord123!', 12);
    db.prepare(`INSERT INTO users (naam, email, wachtwoord, rol) VALUES (?, ?, ?, ?)`)
      .run('Beheerder', 'admin@praktijk.nl', hash, 'admin');
    console.log('');
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║  STANDAARD ADMIN ACCOUNT AANGEMAAKT                         ║');
    console.log('║  Email:    admin@praktijk.nl                                ║');
    console.log('║  Wachtwoord: WijzigDitWachtwoord123!                        ║');
    console.log('║  ⚠️  WIJZIG DIT WACHTWOORD DIRECT NA EERSTE LOGIN!           ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log('');
  }
}

module.exports = { initDb };
