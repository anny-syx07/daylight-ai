import { neon } from '@neondatabase/serverless';
import { mkdirSync, readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

const cloud = Boolean(process.env.VERCEL);
if (cloud && (!process.env.DATABASE_URL || !process.env.ENCRYPTION_KEY)) throw new Error('Vercel requires DATABASE_URL and ENCRYPTION_KEY.');
const remote = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;
const namespace = process.env.STORE_NAMESPACE || '';
const scoped = (name: string) => name.startsWith(namespace) ? name : namespace + name;
const directory = process.env.DATA_DIR || '.data';
if (!remote) mkdirSync(directory, { recursive: true, mode: 0o700 });
const keyPath = join(directory, 'encryption.key');
if (remote && !process.env.ENCRYPTION_KEY) throw new Error('Remote storage requires a persistent ENCRYPTION_KEY.');
if (!remote && !process.env.ENCRYPTION_KEY && !existsSync(keyPath)) writeFileSync(keyPath, randomBytes(32).toString('hex'), { mode: 0o600 });
const key = Buffer.from(process.env.ENCRYPTION_KEY || readFileSync(keyPath, 'utf8').trim(), 'hex');
if (key.length !== 32) throw new Error('ENCRYPTION_KEY must be 64 hexadecimal characters');
export const db = remote ? null : new (await import('node:sqlite')).DatabaseSync(join(directory, 'daylight.db'));
if (db) {
  chmodSync(join(directory, 'daylight.db'), 0o600);
  db.exec('PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
}
let initialized: Promise<unknown> | undefined;
function initialize() { return initialized ||= remote!.query('CREATE TABLE IF NOT EXISTS daylight_kv (key TEXT PRIMARY KEY, value JSONB NOT NULL)').catch(error => { initialized = undefined; throw error; }); }
export async function get<T>(name: string, fallback: T): Promise<T> {
  name = scoped(name);
  if (remote) { await initialize(); const rows = await remote.query('SELECT value FROM daylight_kv WHERE key = $1', [name]); return rows.length ? rows[0].value as T : fallback; }
  const row = db!.prepare('SELECT value FROM kv WHERE key = ?').get(name) as { value: string } | undefined;
  return row ? JSON.parse(row.value) as T : fallback;
}
export async function set(name: string, value: unknown) {
  name = scoped(name);
  if (remote) { await initialize(); await remote.query('INSERT INTO daylight_kv VALUES ($1, $2::jsonb) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [name, JSON.stringify(value)]); }
  else db!.prepare('INSERT INTO kv VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(name, JSON.stringify(value));
}
export async function remove(name: string) {
  name = scoped(name);
  if (remote) { await initialize(); await remote.query('DELETE FROM daylight_kv WHERE key = $1', [name]); }
  else db!.prepare('DELETE FROM kv WHERE key = ?').run(name);
}
export async function getOrCreate<T>(name: string, value: T): Promise<T> {
  name = scoped(name);
  if (remote) { await initialize(); const rows = await remote.query('INSERT INTO daylight_kv VALUES ($1, $2::jsonb) ON CONFLICT(key) DO UPDATE SET key = excluded.key RETURNING value', [name, JSON.stringify(value)]); return rows[0].value as T; }
  db!.prepare('INSERT OR IGNORE INTO kv VALUES (?, ?)').run(name, JSON.stringify(value));
  return get(name, value);
}
export async function update<T>(name: string, fallback: T, change: (value: T) => T): Promise<T> {
  name = scoped(name);
  if (!remote) {
    const row = db!.prepare('SELECT value FROM kv WHERE key = ?').get(name) as { value: string } | undefined;
    const value = change(row ? JSON.parse(row.value) : fallback);
    db!.prepare('INSERT INTO kv VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(name, JSON.stringify(value));
    return value;
  }
  await initialize();
  for (let attempt = 0; attempt < 12; attempt++) {
    const rows = await remote.query('SELECT value FROM daylight_kv WHERE key = $1', [name]);
    const value = change(rows.length ? rows[0].value as T : fallback);
    const result = rows.length
      ? await remote.query('UPDATE daylight_kv SET value = $2::jsonb WHERE key = $1 AND value = $3::jsonb RETURNING key', [name, JSON.stringify(value), JSON.stringify(rows[0].value)])
      : await remote.query('INSERT INTO daylight_kv VALUES ($1, $2::jsonb) ON CONFLICT DO NOTHING RETURNING key', [name, JSON.stringify(value)]);
    if (result.length) return value;
  }
  throw new Error('Concurrent storage update; retry.');
}
export async function claim(name: string, owner: string, duration: number) {
  name = scoped(name);
  const value = { owner, expires: Date.now() + duration };
  if (remote) { await initialize(); return (await remote.query('INSERT INTO daylight_kv VALUES ($1, $2::jsonb) ON CONFLICT(key) DO UPDATE SET value = excluded.value WHERE (daylight_kv.value->>\'expires\')::bigint < $3 RETURNING key', [name, JSON.stringify(value), Date.now()])).length > 0; }
  const current = db!.prepare('SELECT value FROM kv WHERE key = ?').get(name) as { value: string } | undefined;
  if (current && JSON.parse(current.value).expires > Date.now()) return false;
  await set(name, value); return true;
}
export async function release(name: string, owner: string) {
  name = scoped(name);
  if (remote) { await initialize(); await remote.query('DELETE FROM daylight_kv WHERE key = $1 AND value->>\'owner\' = $2', [name, owner]); }
  else { const current = await get<{ owner: string } | null>(name, null); if (current?.owner === owner) await remove(name); }
}
export function seal(value: string) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  return Buffer.concat([nonce, cipher.update(value, 'utf8'), cipher.final(), cipher.getAuthTag()]).toString('base64');
}
export function unseal(value: string) {
  const bytes = Buffer.from(value, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(-16));
  return Buffer.concat([decipher.update(bytes.subarray(12, -16)), decipher.final()]).toString('utf8');
}
export async function secret(name: string): Promise<string | undefined> { const value = await get<string | null>(name, null); return value ? unseal(value) : undefined; }
