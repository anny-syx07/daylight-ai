import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

const directory = process.env.DATA_DIR || '.data';
mkdirSync(directory, { recursive: true, mode: 0o700 });
const keyPath = join(directory, 'encryption.key');
if (!process.env.ENCRYPTION_KEY && !existsSync(keyPath)) writeFileSync(keyPath, randomBytes(32).toString('hex'), { mode: 0o600 });
const key = Buffer.from(process.env.ENCRYPTION_KEY || readFileSync(keyPath, 'utf8').trim(), 'hex');
if (key.length !== 32) throw new Error('ENCRYPTION_KEY must be 64 hexadecimal characters');
export const db = new DatabaseSync(join(directory, 'daylight.db'));
chmodSync(join(directory, 'daylight.db'), 0o600);
db.exec('PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
export function get<T>(name: string, fallback: T): T {
  const row = db.prepare('SELECT value FROM kv WHERE key = ?').get(name) as { value: string } | undefined;
  return row ? JSON.parse(row.value) as T : fallback;
}
export function set(name: string, value: unknown) { db.prepare('INSERT INTO kv VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(name, JSON.stringify(value)); }
export function remove(name: string) { db.prepare('DELETE FROM kv WHERE key = ?').run(name); }
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
export function secret(name: string): string | undefined { const value = get<string | null>(name, null); return value ? unseal(value) : undefined; }
