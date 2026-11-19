import ical from 'node-ical';
import PostalMime from 'postal-mime';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { get, set, secret, seal, remove, update, workspaceId } from './store.js';
import { registerBridge, unregisterBridge } from './member-auth.js';
import type { Item, ImportPreview, ImportStatus } from '../src/types.js';
import { bridgeCode,reminderClockCode } from './gmail-bridge.js';
import { parseSisSchedule } from './sis-import.js';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const plain = (value: unknown, limit = 2000) => String(typeof value === 'object' && value && 'val' in value ? value.val : value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit);
const https = (value: unknown) => { try { const raw = typeof value === 'object' && value && 'val' in value ? value.val : value; const url = new URL(String(raw)); return url.protocol === 'https:' && !url.username && !url.password ? url.href : undefined; } catch { return undefined; } };

export async function parseImport(filename: unknown, encoded: unknown, now = Date.now()): Promise<Omit<ImportPreview, 'id'>> {
  if (typeof filename !== 'string' || filename.length > 200 || typeof encoded !== 'string' || encoded.length > 1400000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw new Error('Chọn tệp .ics, .eml hoặc .sis.json, tối đa 1 MB.');
  const bytes = Buffer.from(encoded, 'base64');
  if (!bytes.length || bytes.length > 1024 * 1024) throw new Error('Tệp trống hoặc lớn hơn 1 MB.');
  const label = plain(filename, 100);
  if (/\.sis\.json$/i.test(filename)) {
    let data: unknown;
    try { data = JSON.parse(bytes.toString('utf8')); } catch { throw new Error('Tệp SIS không đọc được.'); }
    return parseSisSchedule(data);
  }
  if (/\.eml$/i.test(filename)) {
    const email = await PostalMime.parse(bytes);
    if (!email.subject && !email.from?.address) throw new Error('Tệp này không có tiêu đề hoặc người gửi email hợp lệ.');
    const group = `mail:${hash(email.messageId || encoded).slice(0, 32)}`;
    return { group, label, warnings: ['Email được nhập thủ công. Tệp đính kèm không được lưu; deadline cần bạn xác nhận bằng nút Thêm việc.'], items: [{ id: `import:${group}`, source: 'import', kind: 'mail', title: plain(email.subject || '(Không có tiêu đề)', 300), course: plain(email.from?.name || email.from?.address || 'Email nhập tay', 100), due: null, detail: plain(email.text || email.html), importGroup: group, importLabel: 'Email · nhập thủ công' }] };
  }
  if (!/\.ics$/i.test(filename)) throw new Error('Chỉ hỗ trợ lịch .ics, email .eml hoặc thời khóa biểu .sis.json.');
  let content = bytes.toString('utf8').replace(/^\uFEFF/, '');
  if (!/^BEGIN:VCALENDAR\s*$/mi.test(content) || !/^END:VCALENDAR\s*$/mi.test(content)) throw new Error('Tệp chưa đúng định dạng lịch iCalendar.');
  if ((content.match(/^BEGIN:VEVENT/igm) || []).length > 1000) throw new Error('Mỗi lần nhập tối đa 1.000 sự kiện gốc.');
  const warnings: string[] = [];
  const floating = /^(DTSTART|DTEND|RECURRENCE-ID|EXDATE|RDATE):(?=\d{8}T\d{6}(?:,\d{8}T\d{6})*\r?$)/gm;
  if (floating.test(content)) {
    const timezone = content.match(/^X-WR-TIMEZONE:(.+)\r?$/m)?.[1].trim() || 'Asia/Ho_Chi_Minh';
    try { new Intl.DateTimeFormat('en', { timeZone: timezone }); } catch { throw new Error('Múi giờ trong lịch chưa được hỗ trợ. Hãy xuất lịch có múi giờ rõ ràng.'); }
    content = content.replace(floating, `$1;TZID=${timezone}:`);
    warnings.push(`Giờ không ghi múi giờ được đọc theo ${timezone}.`);
  }
  const parsed = await ical.async.parseICS(content);
  const group = `calendar:${hash(filename.toLowerCase()).slice(0, 24)}`;
  const items: Item[] = [];
  for (const event of Object.values(parsed)) {
    if (!event || event.type !== 'VEVENT') continue;
    if (event.status === 'CANCELLED') continue;
    if (!event.uid || !(event.start instanceof Date) || !Number.isFinite(event.start.getTime())) { warnings.push('Bỏ qua một sự kiện thiếu mã hoặc ngày bắt đầu hợp lệ.'); continue; }
    let instances;
    try { instances = ical.expandRecurringEvent(event, { from: new Date(now - 30 * 86400000), to: new Date(now + 366 * 86400000), maxIterations: 10000 }); }
    catch { throw new Error('Lịch có quy tắc lặp quá phức tạp. Hãy xuất lịch trong khoảng thời gian ngắn hơn.'); }
    for (const instance of instances) {
      if (instance.event.status === 'CANCELLED') continue;
      if (items.length >= 2000) throw new Error('Lịch vượt 2.000 lần diễn ra. Hãy chia nhỏ tệp.');
      const date = instance.start.toISOString();
      const calendarDate = `${instance.start.getFullYear()}-${String(instance.start.getMonth() + 1).padStart(2, '0')}-${String(instance.start.getDate()).padStart(2, '0')}`;
      const key = event.uid + (instance.isRecurring ? `:${instance.event.recurrenceid?.toISOString() || date}` : '');
      const url = https(instance.event.url);
      const canvasUrl = url ? new URL(url) : null;
      const assignmentMatch = canvasUrl?.pathname.match(/^\/courses\/\d+\/assignments\/(\d+)(?:\/|$)/);
      const calendarAssignment = canvasUrl?.pathname === '/calendar' ? canvasUrl.searchParams.get('event')?.match(/^assignment_(\d+)$/) : null;
      const canvasUid = canvasUrl?.pathname === '/calendar' ? event.uid.match(/^event-assignment-(\d+)$/) : null;
      const assignmentId = Number(assignmentMatch?.[1] || calendarAssignment?.[1] || canvasUid?.[1]) || undefined;
      items.push({ id: `import:${group}:${hash(key).slice(0, 24)}`, source: 'import', kind: assignmentId ? 'assignment' : 'event', title: plain(instance.summary || '(Không có tiêu đề)', 300), course: assignmentId ? 'Canvas · lịch nhập' : 'Lịch nhập tay', due: instance.isFullDay ? `${calendarDate}T12:00:00.000Z` : date, end: !instance.isFullDay && instance.end && Number.isFinite(instance.end.getTime()) ? instance.end.toISOString() : undefined, location: plain(instance.event.location, 200), allDay: instance.isFullDay, url, canvasAssignmentId: assignmentId, canvasOrigin:assignmentId?canvasUrl?.origin:undefined, detail: plain(instance.event.description), importGroup: group, importLabel: 'Lịch .ics · bản chụp thủ công' });
    }
  }
  if (Object.values(parsed).some(event => event?.type === 'VTODO')) warnings.push('Mục To-do trong tệp chưa được nhập.');
  warnings.push('Chỉ nhập 30 ngày trước đến 366 ngày tới. Nhập lại cùng tên tệp sẽ thay bản lịch trước đó, gồm cả thay đổi và hủy lịch. Sự kiện cả ngày không có nhắc theo giờ.');
  return { items: [...new Map(items.map(item => [item.id, item])).values()], group, label, warnings };
}

export async function previewImport(filename: unknown, encoded: unknown) {
  const preview = { ...await parseImport(filename, encoded), id: randomBytes(24).toString('hex') };
  await set('import:preview', { ...preview, expires: Date.now() + 600000 });
  return preview;
}
export async function commitImport(id: unknown) {
  const preview = await get<(ImportPreview & { expires: number }) | null>('import:preview', null);
  if (!preview || preview.id !== id || preview.expires < Date.now()) throw new Error('Bản xem trước đã hết hạn. Chọn lại tệp nhé.');
  await update<Item[]>('imported', [], previous => {
    const next = [...previous.filter(item => item.importGroup !== preview.group), ...preview.items];
    if (next.length > 5000) throw new Error('Góc nhập dữ liệu đã đầy (5.000 mục). Xóa bớt trước khi nhập thêm.');
    return next;
  });
  await set('import:last', new Date().toISOString());
  if (preview.group.startsWith('sis:')) {
    await set('sis:last-import', new Date().toISOString());
    if (preview.sisCatalog) await set('sis:catalog', preview.sisCatalog);
  }
  await remove('import:preview');
  return { count: preview.items.length };
}
export async function importStatus(): Promise<ImportStatus> {
  const configured = Boolean(await get('gmail:secret', null));
  const items = await get<Item[]>('imported', []);
  return { count: items.length, gmail: { ...await get('gmail:status', {}), receivedCount: items.filter(item => item.importGroup === 'gmail').length, configured }, lastImported: await get<string | undefined>('import:last', undefined), sis: { ...await get('sis:status', {}), count: items.filter(item => item.importGroup?.startsWith('sis:')).length, configured: Boolean(await get('sis:secret', null)), lastImported: await get<string | undefined>('sis:last-import', undefined) } };
}
export async function gmailAuthorized(header: string | undefined) {
  const key = await secret('gmail:secret');
  return Boolean(key && timingSafeEqual(Buffer.from(hash(header || '')), Buffer.from(hash(`Bearer ${key}`))));
}
export async function receiveGmail(body: unknown) {
  if (!body || typeof body !== 'object' || !('messages' in body) || !Array.isArray(body.messages) || body.messages.length > 20) throw new Error('Gói email không hợp lệ.');
  const items: Item[] = body.messages.map((message: any) => {
    if (!message || typeof message.id !== 'string' || !/^[a-f0-9]{1,40}$/.test(message.id) || typeof message.subject !== 'string' || typeof message.snippet !== 'string') throw new Error('Email không đúng định dạng.');
    return { id: `import:gmail:${message.id}`, source: 'import', kind: 'mail', title: plain(message.subject || '(Không có tiêu đề)', 300), course: plain(message.from || 'Gmail', 100), due: null, detail: plain(message.snippet), importGroup: 'gmail', importLabel: 'Gmail · nhãn Daylight', url: `https://mail.google.com/mail/u/0/#all/${message.id}` };
  });
  await update<Item[]>('imported', [], previous => {
    const incoming = new Set(items.map(item => item.id));
    const next = [...previous.filter(item => !incoming.has(item.id)), ...items];
    if (next.length > 5000) throw new Error('Đã đạt giới hạn 5.000 mục nhập.');
    return next;
  });
  await set('gmail:status', { lastReceived: new Date().toISOString(), receivedCount: items.length });
  return { count: items.length };
}

export const gmailManifest = JSON.stringify({ timeZone: 'Asia/Ho_Chi_Minh', dependencies: { enabledAdvancedServices: [{ userSymbol: 'Gmail', serviceId: 'gmail', version: 'v1' }] }, exceptionLogging: 'NONE', runtimeVersion: 'V8', oauthScopes: ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/script.external_request', 'https://www.googleapis.com/auth/script.scriptapp'] }, null, 2);

export async function gmailSetup(appOrigin: string, create = false) {
  let key = await secret('gmail:secret');
  if (!key && create) { key = randomBytes(32).toString('hex'); await set('gmail:secret', seal(key)); }
  if (!key) return null;
  await registerBridge('gmail',key,workspaceId());
  const code = bridgeCode({ endpoint: `${appOrigin}/api/imports/gmail/receive`, key });
  return { code, manifest: gmailManifest,clockCode:reminderClockCode({endpoint:`${appOrigin}/api/imports/gmail/receive`,key}),clockManifest:JSON.stringify({timeZone:'Asia/Ho_Chi_Minh',exceptionLogging:'NONE',runtimeVersion:'V8',oauthScopes:['https://www.googleapis.com/auth/script.external_request','https://www.googleapis.com/auth/script.scriptapp']},null,2) };
}
export async function revokeGmail() { const key=await secret('gmail:secret');if(key)await unregisterBridge('gmail',key);await remove('gmail:secret');await remove('gmail:status'); }
