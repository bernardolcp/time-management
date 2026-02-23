import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data', 'productivity.db');

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    const fs = require('fs');
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initDb(db);
  }
  return db;
}

function initDb(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      area TEXT NOT NULL,
      q1_target INTEGER DEFAULT 0,
      q1_actual INTEGER DEFAULT 0,
      q2_target INTEGER DEFAULT 0,
      q2_actual INTEGER DEFAULT 0,
      q3_target INTEGER DEFAULT 0,
      q3_actual INTEGER DEFAULT 0,
      q4_target INTEGER DEFAULT 0,
      q4_actual INTEGER DEFAULT 0,
      unit TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS behaviors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      goal_id INTEGER REFERENCES goals(id) ON DELETE SET NULL,
      frequency TEXT DEFAULT 'daily',
      created_at TEXT DEFAULT (datetime('now')),
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS behavior_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      behavior_id INTEGER NOT NULL REFERENCES behaviors(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      done INTEGER DEFAULT 0,
      UNIQUE(behavior_id, date)
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      title TEXT NOT NULL,
      type TEXT DEFAULT 'shallow' CHECK(type IN ('deep', 'shallow')),
      estimated_minutes INTEGER DEFAULT 30,
      actual_minutes INTEGER DEFAULT 0,
      goal_id INTEGER REFERENCES goals(id) ON DELETE SET NULL,
      is_frog INTEGER DEFAULT 0,
      urgent INTEGER DEFAULT 0,
      important INTEGER DEFAULT 0,
      completed INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS weekly_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      week_start TEXT NOT NULL UNIQUE,
      wins TEXT DEFAULT '',
      didnt_work TEXT DEFAULT '',
      deep_work_hours REAL DEFAULT 0,
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS calendar_events (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      date TEXT NOT NULL,
      all_day INTEGER DEFAULT 0,
      fetched_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      active INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS daily_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL UNIQUE,
      energy_level INTEGER DEFAULT 3,
      focus_word TEXT DEFAULT '',
      training INTEGER DEFAULT 0,
      spiritual INTEGER DEFAULT 0,
      family_day INTEGER DEFAULT 0,
      content_creation INTEGER DEFAULT 0,
      coach_advice TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS daily_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL UNIQUE,
      score INTEGER DEFAULT 0,
      review_text TEXT DEFAULT '',
      tasks_completed INTEGER DEFAULT 0,
      tasks_total INTEGER DEFAULT 0,
      deep_work_minutes INTEGER DEFAULT 0,
      completion_rate REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Add project_id column to tasks if not present
  try {
    db.exec(`ALTER TABLE tasks ADD COLUMN project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL`);
  } catch { /* column already exists */ }

  // Seed default projects if empty
  const projectCount = db.prepare('SELECT COUNT(*) as c FROM projects').get() as { c: number };
  if (projectCount.c === 0) {
    const insertProject = db.prepare('INSERT INTO projects (name, sort_order) VALUES (?, ?)');
    insertProject.run('Latam Ventures', 1);
    insertProject.run('Compound', 2);
    insertProject.run('BSV', 3);
    insertProject.run('Stanford', 4);
    insertProject.run('Outros', 5);
  }

  // Seed default settings if empty
  const count = db.prepare('SELECT COUNT(*) as c FROM settings').get() as { c: number };
  if (count.c === 0) {
    const insert = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
    insert.run('deep_work_start', '09:00');
    insert.run('deep_work_end', '12:00');
    insert.run('work_start', '08:00');
    insert.run('work_end', '18:00');
    insert.run('chronotype', 'morning');
    insert.run('available_hours', '8');
  }
}
