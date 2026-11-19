import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { get, set, update, seal, secret, remove, claim, release, workspaceId } from './store.js';
import { registerBridge, unregisterBridge } from './member-auth.js';
import { parseSisSchedule } from './sis-import.js';
import { extensionZip } from './sis-extension.js';
import type { Item, SisCatalog } from '../src/types.js';

const digest = (value: string) => createHash('sha256').update(value).digest();
export async function sisAuthorized(header?: string) {
  const key = await secret('sis:secret');
  return Boolean(key && timingSafeEqual(digest(header || ''), digest(`Bearer ${key}`)));
}
export async function sisSetup(origin: string) {
  const catalog = await get<SisCatalog | null>('sis:catalog', null);
  if (!catalog) throw new Error('Nhập thời khóa biểu SIS trước nhé.');
  let key = await secret('sis:secret');
  if (!key) { key = randomBytes(32).toString('hex'); await set('sis:secret', seal(key)); }
  await registerBridge('sis',key,workspaceId());
  return extensionZip({ ...catalog, endpoint: `${origin}/api/imports/sis/receive`, key });
}
export async function revokeSis() { const key=await secret('sis:secret');if(key)await unregisterBridge('sis',key);await remove('sis:secret'); await remove('sis:status'); }
export async function receiveSis(body: any) {
  if (body && typeof body === 'object' && typeof body.error === 'string') {
    const errors: Record<string, string> = { signin: 'Cần đăng nhập lại SIS trong Chrome.', layout: 'SIS đổi giao diện. Lịch cũ được giữ.', partial: 'Chưa đọc đủ bảng SIS. Lịch cũ được giữ.', unavailable: 'Chưa kiểm tra được SIS. Lịch cũ được giữ.' };
    if (!errors[body.error]) throw new Error('Invalid status');
    await update<Record<string, unknown>>('sis:status', {}, previous => ({ ...previous, error: errors[body.error] }));
    return { ok: true };
  }
  const parsed = parseSisSchedule(body);
  const catalog = await get<SisCatalog | null>('sis:catalog', null);
  if (!catalog || JSON.stringify([...parsed.sisCatalog!.courses].sort((a,b)=>a.code.localeCompare(b.code))) !== JSON.stringify([...catalog.courses].sort((a,b)=>a.code.localeCompare(b.code))) || parsed.sisCatalog!.term !== catalog.term || body.courses.some((c: any) => !c.rows.length)) throw new Error('Incomplete timetable');
  const captured = Date.parse(body.capturedAt);
  if (!Number.isFinite(captured) || captured < Date.now() - 600000 || captured > Date.now() + 60000) throw new Error('Stale timetable');
  const owner = randomBytes(16).toString('hex');
  if (!await claim('sis:write-lock', owner, 30000)) throw new Error('Sync busy');
  try {
    const previousCapture = await get<number>('sis:last-capture', 0);
    if (captured <= previousCapture) throw new Error('Stale timetable');
    let changed = 0;
    const meaningful = (item: Item) => JSON.stringify([item.title,item.course,item.due,item.end,item.location,item.lessonType,item.instructor]);
    await update<Item[]>('imported', [], previous => {
      const old = new Map(previous.filter(i => i.importGroup === parsed.group).map(i => [i.id, meaningful(i)]));
      const incoming = new Map(parsed.items.map(i => [i.id, meaningful(i)]));
      changed = [...new Set([...old.keys(), ...incoming.keys()])].filter(id => old.get(id) !== incoming.get(id)).length;
      const next = [...previous.filter(i => i.importGroup !== parsed.group), ...parsed.items.map(i => ({ ...i, importLabel: `SIS · ${catalog.term} · cầu nối Chrome` }))];
      if (next.length > 5000) throw new Error('Storage limit');
      return next;
    });
    await set('sis:last-capture', captured);
    await set('sis:status', { lastChecked: new Date().toISOString(), changed });
    return { count: parsed.items.length, changed };
  } finally { await release('sis:write-lock', owner); }
}
