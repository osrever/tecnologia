import {DatabaseSync} from 'node:sqlite'
import {mkdirSync} from 'node:fs'
import {dirname} from 'node:path'

export function openDatabase(path = process.env.DB_PATH || 'private/app.sqlite') {
  if (path !== ':memory:') mkdirSync(dirname(path), {recursive:true,mode:0o700})
  const db = new DatabaseSync(path)
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY, first TEXT NOT NULL, last TEXT NOT NULL, name_key TEXT NOT NULL,
      group_no INTEGER NOT NULL CHECK(group_no IN (3,4)), code_hash TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS student_name ON students(name_key);
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY, student TEXT REFERENCES students(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('teacher','student')), expires INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS topics (id INTEGER PRIMARY KEY CHECK(id BETWEEN 1 AND 9), title TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS questions (id TEXT PRIMARY KEY, version INTEGER NOT NULL, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS attempts (
      id TEXT PRIMARY KEY, student TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      started INTEGER NOT NULL, finished INTEGER, topics TEXT NOT NULL, items TEXT NOT NULL,
      answers TEXT NOT NULL DEFAULT '{}', result TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS one_active_exam ON attempts(student) WHERE finished IS NULL;
    CREATE TABLE IF NOT EXISTS limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
  `)
  for (let i = 1; i <= 9; i++) db.prepare('INSERT OR IGNORE INTO topics VALUES (?,?)').run(i,`Tema ${i}`)
  return db
}
