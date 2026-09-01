import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { defaultSettings } from './fields.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
});

export const q = (text, params) => pool.query(text, params);

// Migrasi sederhana: jalankan file sql/ yang belum tercatat di _migrations
export async function migrate() {
  await q('CREATE TABLE IF NOT EXISTS _migrations (name text PRIMARY KEY, run_at timestamptz NOT NULL DEFAULT now())');
  const dir = path.join(__dirname, '..', 'sql');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  for (const f of files) {
    const { rowCount } = await q('SELECT 1 FROM _migrations WHERE name=$1', [f]);
    if (rowCount) continue;
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO _migrations (name) VALUES ($1)', [f]);
      await client.query('COMMIT');
      console.log(`[migrate] applied ${f}`);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
}

// Tanam nilai awal seluruh grup settings dari skema field.
// Nilai yang SUDAH ADA di database selalu menang — jadi menambah field baru
// di fields.js aman dijalankan berulang dan tidak menimpa suntingan editor.
export async function seedSettings() {
  const defaults = defaultSettings();
  for (const [key, value] of Object.entries(defaults)) {
    await q(
      `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = $2 || settings.value, updated_at = now()`,
      [key, JSON.stringify(value)]
    );
  }
  console.log(`[seed] settings disinkronkan: ${Object.keys(defaults).length} grup`);
}

// Buat akun admin pertama dari env bila belum ada
export async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) return;
  const { rowCount } = await q('SELECT 1 FROM admin_users WHERE email=$1', [email]);
  if (rowCount) return;
  const hash = await bcrypt.hash(password, 10);
  await q('INSERT INTO admin_users (email, password_hash) VALUES ($1,$2)', [email, hash]);
  console.log(`[seed] admin user created: ${email}`);
}
