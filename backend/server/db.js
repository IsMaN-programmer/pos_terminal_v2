import initSqlJs from 'sql.js';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isElectron = !!process.versions.electron;
const DB_PATH = isElectron
  ? path.join(process.env.APPDATA || os.homedir(), 'pos-terminal-v2', 'pos.db')
  : path.join(__dirname, 'pos.db');

let db;
let saveTimer = null;
const SAVE_INTERVAL = 5000;

function saveDb() {
  if (!db) return;
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  } catch (err) {
    console.error('[DB] Save error:', err.message);
  }
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveDb();
    saveTimer = null;
  }, SAVE_INTERVAL);
}

const pool = {
  query(sql, params = []) {
    try {
      sql = sql.replace(/\$(\d+)/g, () => '?');
      const isSelect = sql.trim().toUpperCase().startsWith('SELECT')
        || sql.trim().toUpperCase().startsWith('WITH')
        || sql.includes('RETURNING');

      if (isSelect) {
        const stmt = db.prepare(sql);
        if (params.length > 0) stmt.bind(params);
        const rows = [];
        while (stmt.step()) rows.push(stmt.getAsObject());
        stmt.free();
        return { rows };
      } else {
        db.run(sql, params);
        scheduleSave();
        return { rows: [], changes: db.getRowsModified() };
      }
    } catch (err) {
      console.error('[DB] Query error:', err.message);
      console.error('[DB] SQL:', sql);
      console.error('[DB] Params:', params);
      throw err;
    }
  }
};

const MIGRATIONS = [
  {
    name: 'initial_schema',
    up: (db) => {
      db.run(`CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, email TEXT, password TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        role TEXT DEFAULT 'cashier', pin TEXT,
        is_admin INTEGER DEFAULT 0, last_seen TEXT
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY, order_number INTEGER,
        timestamp TEXT DEFAULT (datetime('now')),
        total INTEGER DEFAULT 0, payment_type TEXT,
        items TEXT DEFAULT '[]', split_payments TEXT,
        cashier TEXT, guest_count INTEGER DEFAULT 1, discount INTEGER DEFAULT 0
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS menu (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL, price INTEGER NOT NULL,
        category TEXT, mxik_code TEXT, emoji TEXT, photo TEXT
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, emoji TEXT
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS tables (
        id INTEGER PRIMARY KEY, name TEXT NOT NULL,
        seats INTEGER DEFAULT 4, status TEXT DEFAULT 'free', price INTEGER DEFAULT 0
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS guests (
        phone TEXT PRIMARY KEY, name TEXT,
        points INTEGER DEFAULT 0, total_spent INTEGER DEFAULT 0, tier TEXT DEFAULT 'basic'
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS warehouse (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL, unit TEXT, cost INTEGER DEFAULT 0, stock REAL DEFAULT 0
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS tech_cards (
        menu_item_id INTEGER PRIMARY KEY, ingredients TEXT DEFAULT '[]'
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS suppliers (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT,
        email TEXT, address TEXT, inn TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS stock_movements (
        id TEXT PRIMARY KEY, type TEXT NOT NULL, supplier_id TEXT,
        from_location TEXT, to_location TEXT, items TEXT NOT NULL,
        note TEXT, created_at TEXT DEFAULT (datetime('now')), created_by TEXT
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS returns (
        id TEXT PRIMARY KEY, order_id TEXT, order_number INTEGER,
        amount INTEGER NOT NULL, payment_type TEXT, split_payments TEXT,
        items TEXT, reason TEXT, cashier TEXT, status TEXT DEFAULT 'pending',
        fiscal_sign TEXT, created_at TEXT DEFAULT (datetime('now'))
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS data_store (
        key TEXT PRIMARY KEY, value TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL, applied_at TEXT DEFAULT (datetime('now'))
      )`);
    }
  },
  {
    name: 'data_store_table',
    up: (db) => {
      db.run(`CREATE TABLE IF NOT EXISTS data_store (
        key TEXT PRIMARY KEY, value TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      )`);
    }
  }
];

export async function initDb() {
  try {
    const SQL = await initSqlJs();
    let loadBuffer = null;
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    if (fs.existsSync(DB_PATH)) {
      loadBuffer = fs.readFileSync(DB_PATH);
    }
    db = new SQL.Database(loadBuffer);
    db.run("PRAGMA foreign_keys = ON");

    const applied = new Set();
    try {
      const stmt = db.prepare("SELECT name FROM schema_migrations");
      while (stmt.step()) applied.add(stmt.getAsObject().name);
      stmt.free();
    } catch (_) {}

    for (const migration of MIGRATIONS) {
      if (!applied.has(migration.name)) {
        console.log(`[DB] Running migration: ${migration.name}`);
        migration.up(db);
        db.run("INSERT INTO schema_migrations (name) VALUES (?)", [migration.name]);
        console.log(`[DB] Migration applied: ${migration.name}`);
      }
    }

    saveDb();
    console.log('[DB] Database initialized successfully');
  } catch (err) {
    console.error('[DB] Init error:', err);
    throw err;
  }
}

process.on('exit', () => { if (db) saveDb(); });
process.on('SIGINT', () => { if (db) saveDb(); process.exit(0); });
process.on('SIGTERM', () => { if (db) saveDb(); process.exit(0); });

export default pool;
