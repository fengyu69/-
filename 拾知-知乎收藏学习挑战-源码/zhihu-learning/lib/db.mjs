import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function openDB(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password TEXT NOT NULL,
      nickname TEXT NOT NULL, created_at TEXT NOT NULL, discoverable INTEGER NOT NULL DEFAULT 0,
      topic TEXT NOT NULL DEFAULT '摄影', level TEXT NOT NULL DEFAULT '入门',
      slot TEXT NOT NULL DEFAULT '晚上', timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
      ai_consent INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS consents (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      source TEXT NOT NULL, scope TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      url TEXT NOT NULL, title TEXT NOT NULL, excerpt TEXT NOT NULL, author TEXT NOT NULL,
      collection TEXT NOT NULL, saved_at TEXT, imported_at TEXT NOT NULL,
      topic TEXT NOT NULL DEFAULT '未分类', engine TEXT NOT NULL DEFAULT '待分析',
      UNIQUE(user_id,url)
    );
    CREATE TABLE IF NOT EXISTS topic_states (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      topic TEXT NOT NULL, state TEXT NOT NULL, PRIMARY KEY(user_id,topic)
    );
    CREATE TABLE IF NOT EXISTS challenges (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      topic TEXT NOT NULL, title TEXT NOT NULL, start_date TEXT NOT NULL,
      minutes INTEGER NOT NULL, engine TEXT NOT NULL, days TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS checkins (
      id TEXT PRIMARY KEY, challenge_id TEXT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
      day INTEGER NOT NULL CHECK(day BETWEEN 1 AND 14), read_done INTEGER NOT NULL,
      practice_done INTEGER NOT NULL, review_done INTEGER NOT NULL, reflection TEXT NOT NULL,
      artifact TEXT NOT NULL DEFAULT '', shared INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL, UNIQUE(challenge_id,day)
    );
    CREATE TABLE IF NOT EXISTS buddy_requests (
      id TEXT PRIMARY KEY, sender TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recipient TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL,
      CHECK(sender<>recipient)
    );
    CREATE TABLE IF NOT EXISTS feedback (
      id TEXT PRIMARY KEY, checkin_id TEXT NOT NULL REFERENCES checkins(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_items_user ON items(user_id);
    CREATE INDEX IF NOT EXISTS idx_challenges_user ON challenges(user_id);
    CREATE INDEX IF NOT EXISTS idx_buddy_sender ON buddy_requests(sender,status);
    CREATE INDEX IF NOT EXISTS idx_buddy_recipient ON buddy_requests(recipient,status);
    PRAGMA user_version=1;
  `);
  // Lightweight migrations for databases created by earlier MVP versions.
  try { db.exec("ALTER TABLE challenges ADD COLUMN paused INTEGER NOT NULL DEFAULT 0"); } catch {}
  try { db.exec("ALTER TABLE challenges ADD COLUMN paused_at TEXT"); } catch {}
  return db;
}

export function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const result = fn(); db.exec('COMMIT'); return result; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}
