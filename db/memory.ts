// db/memory.ts — conversation memory using better-sqlite3
// run: npm install better-sqlite3 @types/better-sqlite3

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_DIR = path.join(process.cwd(), '.data');
const DB_PATH = path.join(DB_DIR, 'conversations.db');

// ensure .data folder exists
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(DB_PATH);

// one-time table setup
db.exec(`
  CREATE TABLE IF NOT EXISTS turns (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    session   TEXT    NOT NULL,
    role      TEXT    NOT NULL,
    content   TEXT    NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_session ON turns(session, id);
`);

export interface Turn {
  role: 'user' | 'assistant';
  content: string;
}

// save a single turn
export function saveTurn(session: string, role: 'user' | 'assistant', content: string) {
  db.prepare('INSERT INTO turns (session, role, content) VALUES (?, ?, ?)').run(session, role, content);
}

// get last N turns for context window
export function getHistory(session: string, limit = 10): Turn[] {
  const rows = db.prepare(
    'SELECT role, content FROM turns WHERE session = ? ORDER BY id DESC LIMIT ?'
  ).all(session, limit) as Turn[];
  return rows.reverse(); // chronological order
}

// get all sessions summary (for debug / admin)
export function getSessions(): { session: string; turns: number; last: string }[] {
  return db.prepare(
    `SELECT session, COUNT(*) as turns, MAX(created_at) as last
     FROM turns GROUP BY session ORDER BY last DESC`
  ).all() as { session: string; turns: number; last: string }[];
}