import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { bridgeCode } from '../server/gmail-bridge.js';

const directory = mkdtempSync(join(tmpdir(), 'daylight-import-'));
process.env.DATA_DIR = directory;
delete process.env.DATABASE_URL;
const { parseImport, previewImport, commitImport, gmailSetup, gmailAuthorized, receiveGmail, importStatus } = await import('../server/imports.js');
const { get, set, db } = await import('../server/store.js');
after(() => { db?.close(); rmSync(directory, { recursive: true, force: true }); });
const encoded = (text: string) => Buffer.from(text).toString('base64');
const now = Date.parse('2026-11-19T00:00:00Z');
const calendar = (events: string) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${events}\r\nEND:VCALENDAR`;
const event = (extra = '') => `BEGIN:VEVENT\r\nUID:deadline-test\r\nDTSTART:20261120T160000Z\r\nSUMMARY:Bài kiểm tra\r\nURL:https://umthcm.instructure.com/courses/12/assignments/34\r\n${extra}\r\nEND:VEVENT`;

test('ICS uses real timezone, recurrence exclusions/overrides, cancellation and safe links', async () => {
  const body = calendar(`BEGIN:VEVENT\r\nUID:repeat\r\nDTSTART;TZID=Asia/Ho_Chi_Minh:20261120T090000\r\nDTEND;TZID=Asia/Ho_Chi_Minh:20261120T100000\r\nSUMMARY:Lớp học\r\nRRULE:FREQ=DAILY;COUNT=3\r\nEXDATE;TZID=Asia/Ho_Chi_Minh:20261121T090000\r\nURL:javascript:alert(1)\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:repeat\r\nRECURRENCE-ID;TZID=Asia/Ho_Chi_Minh:20261122T090000\r\nDTSTART;TZID=Asia/Ho_Chi_Minh:20261122T100000\r\nSUMMARY:Đổi giờ\r\nEND:VEVENT\r\n${event('STATUS:CANCELLED')}`);
  const result = await parseImport('test.ics', encoded(body), now);
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].due, '2026-11-20T02:00:00.000Z');
  assert.equal(result.items[1].due, '2026-11-22T03:00:00.000Z');
  assert.equal(result.items[1].title, 'Đổi giờ');
  assert.equal(result.items[0].url, undefined);
});

test('ICS handles Vietnam floating times, all-day dates and assignment identity', async () => {
  const floating = await parseImport('float.ics', encoded(calendar(event().replace('20261120T160000Z', '20261120T160000'))), now);
  assert.equal(floating.items[0].due, '2026-11-20T09:00:00.000Z');
  assert.match(floating.warnings.join(' '), /Asia\/Ho_Chi_Minh/);
  const result = await parseImport('test.ics', encoded(calendar(event().replace('DTSTART:20261120T160000Z', 'DTSTART;VALUE=DATE:20261120'))), now);
  assert.equal(result.items[0].allDay, true);
  assert.equal(result.items[0].due?.slice(0, 10), '2026-11-20');
  assert.equal(result.items[0].kind, 'assignment');
  const changed = await parseImport('test.ics', encoded(calendar(event().replace('160000Z', '170000Z'))), now);
  assert.equal(changed.items[0].id, result.items[0].id);
});

test('EML decodes MIME without retaining attachments or guessing deadlines', async () => {
  const result = await parseImport('notice.eml', encoded('From: Teacher <teacher@example.edu>\r\nSubject: =?UTF-8?B?VGjDtG5nIGLDoW8=?=\r\nMessage-ID: <test@example.edu>\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary=x\r\n\r\n--x\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nHẹn nộp bài ngày mai.\r\n--x\r\nContent-Type: text/plain; name=secret.txt\r\nContent-Disposition: attachment; filename=secret.txt\r\n\r\nATTACHMENT-MUST-NOT-PERSIST\r\n--x--'), now);
  assert.equal(result.items[0].title, 'Thông báo');
  assert.equal(result.items[0].due, null);
  assert.match(result.items[0].detail!, /Hẹn nộp/);
  assert.ok(!JSON.stringify(result).includes('ATTACHMENT-MUST-NOT-PERSIST'));
});
test('Canvas ICS parameterized calendar URLs and assignment UIDs stay deadlines, not class events', async () => {
  const input = calendar(event().replace('UID:deadline-test', 'UID:event-assignment-34').replace('URL:https://umthcm.instructure.com/courses/12/assignments/34', 'URL;VALUE=URI:https://umthcm.instructure.com/calendar?include_contexts=course_12&month=11&year=2026'));
  const parsed = await parseImport('canvas.ics', encoded(input), now);
  assert.equal(parsed.items[0].kind, 'assignment');
  assert.equal(parsed.items[0].canvasAssignmentId, 34);
  assert.equal(new URL(parsed.items[0].url!).pathname, '/calendar');
  await set('partitions', ['canvas:12:assignment']);
  await set('items:canvas:12:assignment', [{ ...parsed.items[0], id: 'canvas:assignment:12:34', source: 'canvas', kind: 'quiz', completed: true, allDay: false, due: '2026-11-20T16:59:00.000Z' }]);
  await set('imported', parsed.items);
  const { allItems } = await import('../server/connectors.js');
  const merged = await allItems();
  assert.equal(merged.length, 1);
  assert.equal(merged[0].source, 'canvas');
  assert.equal(merged[0].kind, 'quiz');
  assert.equal(merged[0].completed, true);
  await set('items:canvas:12:assignment', [{ ...merged[0], due: null, allDay: false }]);
  await set('imported', [{ ...parsed.items[0], allDay: true, due: '2026-11-25T12:00:00.000Z' }]);
  const fallback = await allItems();
  assert.equal(fallback.length, 1);
  assert.equal(fallback[0].due, '2026-11-25T12:00:00.000Z');
  assert.equal(fallback[0].allDay, true);
  assert.match(fallback[0].importLabel!, /lịch .ics/);
  await set('partitions', []); await set('imported', []);
});

test('import requires confirm; same calendar filename replaces snapshot and preserves stable ids', async () => {
  const date = new Date(Date.now() + 86400000).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const input = calendar(event().replace('20261120T160000Z', date));
  const preview = await previewImport('replace.ics', encoded(input));
  assert.deepEqual(await get('imported', []), []);
  await assert.rejects(commitImport('wrong-id'));
  await commitImport(preview.id);
  assert.equal((await get<any[]>('imported', [])).length, 1);
  const changed = await previewImport('replace.ics', encoded(input.replace('Bài kiểm tra', 'Đổi tên')));
  await commitImport(changed.id);
  assert.equal((await get<any[]>('imported', []))[0].title, 'Đổi tên');
  const empty = await previewImport('replace.ics', encoded(calendar(event('STATUS:CANCELLED'))));
  await commitImport(empty.id);
  assert.deepEqual(await get('imported', []), []);
  await assert.rejects(parseImport('bad.ics', encoded('<html>Sign in</html>'), now));
  await assert.rejects(parseImport('big.eml', 'A'.repeat(1500000), now));
});

test('Gmail inbound uses an independent encrypted key, deduplicates and reports actual receipt', async () => {
  assert.equal(await gmailAuthorized(undefined), false);
  const setup = await gmailSetup('https://daylight.example', true);
  const config = JSON.parse(setup!.code.match(/const DAYLIGHT = (.+);/)![1]);
  assert.ok(!(await get<string>('gmail:secret', '')).includes(config.key));
  assert.equal(await gmailAuthorized(`Bearer ${config.key}`), true);
  assert.equal(await gmailAuthorized('Bearer wrong'), false);
  assert.equal((await importStatus()).gmail.lastReceived, undefined);
  const message = { id: '1234abcd', subject: 'Email thật', from: 'Teacher', snippet: '<script>ignore</script> Lịch học mới' };
  await receiveGmail({ messages: [message] }); await receiveGmail({ messages: [message] });
  const status = await importStatus();
  assert.equal(status.gmail.receivedCount, 1);
  const items = await get<any[]>('imported', []);
  assert.equal(items.length, 1); assert.equal(items[0].due, null);
  await receiveGmail({ messages: [] });
  assert.equal((await importStatus()).gmail.receivedCount, 1);
  await assert.rejects(receiveGmail({ messages: [{ ...message, id: 'https://evil.example' }] }));
  assert.deepEqual(JSON.parse(setup!.manifest).oauthScopes.filter((x: string) => x.includes('gmail')), ['https://www.googleapis.com/auth/gmail.readonly']);
});

test('generated Apps Script exports only labelled messages, retries failures and uses bounded revision markers', () => {
  const sent: Record<string, string> = {};
  let succeed = false;
  let calls = 0;
  let forwarded: any;
  const context: any = {
    console,
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperties: () => ({ ...sent }), deleteProperty: (key: string) => { delete sent[key]; }, setProperties: (values: object) => Object.assign(sent, values) }) },
    Gmail: { Users: {
      Labels: { list: () => ({ labels: [{ id: 'label-1', name: 'Daylight' }] }) },
      Messages: {
        list: (_user: string, options: any) => { assert.deepEqual(Array.from(options.labelIds), ['label-1']); return { messages: [{ id: 'abc123' }] }; },
        get: (_user: string, id: string, options: any) => { assert.equal(options.format, 'full'); return { id, snippet: 'Study notice', payload: { headers: [{ name: 'Subject', value: 'Hello' }] } }; },
      },
    } },
    UrlFetchApp: { fetch: (_url: string, options: any) => { calls++; forwarded = JSON.parse(options.payload); return { getResponseCode: () => succeed ? 200 : 500 }; } },
  };
  runInNewContext(bridgeCode({ endpoint: 'https://daylight.example/api/imports/gmail/receive', key: 'synthetic' }), context);
  assert.throws(() => context.syncDaylight());
  assert.deepEqual(sent, {});
  succeed = true; context.syncDaylight();
  assert.equal(forwarded.messages[0].id, 'abc123');
  assert.equal(typeof sent['sent:v2:abc123'], 'string');
  context.syncDaylight();
  assert.equal(forwarded.messages.length, 0);
  assert.equal(calls, 3);
});
