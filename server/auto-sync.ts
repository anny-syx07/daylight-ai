import { randomUUID } from 'node:crypto';
import { get, set, claim, release } from './store.js';
import { syncAll, publicError } from './connectors.js';
import type { Connection } from '../src/types.js';

export const CANVAS_AUTO_MS = 30 * 60000;
export function canvasAutoDue(enabled: boolean, configured: boolean, lastSync?: string, lastAttempt?: string, now = Date.now()) {
  if (!enabled || !configured) return false;
  const latest = Math.max(Date.parse(lastSync || '') || 0, Date.parse(lastAttempt || '') || 0);
  return now - latest >= CANVAS_AUTO_MS;
}
export async function canvasAutomation() {
  const enabled = await get('automation:canvas-enabled', true);
  const configured = Boolean(await get('canvas-token', null));
  const status = await get<{ lastAttempt?: string; error?: string }>('automation:canvas-status', {});
  const connection = await get<Connection>('connection:canvas', { connected: false });
  const latest = Math.max(Date.parse(connection.lastSync || '') || 0, Date.parse(status.lastAttempt || '') || 0);
  return { enabled, configured, intervalMinutes: 30, ...status, nextCheck: enabled && configured ? new Date(Math.max(Date.now(), latest + CANVAS_AUTO_MS)).toISOString() : undefined };
}
export async function maybeAutoSyncCanvas() {
  const before = await canvasAutomation();
  const connection = await get<Connection>('connection:canvas', { connected: false });
  if (!canvasAutoDue(before.enabled, before.configured, connection.lastSync, before.lastAttempt)) return;
  const owner = randomUUID();
  if (!await claim('lock:auto-canvas', owner, 280000)) return;
  try {
    // Recheck after acquiring the lease: another function may have just refreshed it.
    const current = await canvasAutomation();
    const fresh = await get<Connection>('connection:canvas', { connected: false });
    if (!canvasAutoDue(current.enabled, current.configured, fresh.lastSync, current.lastAttempt)) return;
    const lastAttempt = new Date().toISOString();
    await set('automation:canvas-status', { lastAttempt });
    try { await syncAll(); }
    catch (error) { await set('automation:canvas-status', { lastAttempt, error: publicError(error) }); }
  } finally { await release('lock:auto-canvas', owner); }
}
