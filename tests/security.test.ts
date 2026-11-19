import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const directory = mkdtempSync(join(tmpdir(), 'daylight-test-'));
process.env.DATA_DIR = directory;
process.env.STORE_NAMESPACE = `test-security:${Date.now()}:`;
const store = await import('../server/store.js');
const { pages, safeUrl, normalizeCanvasToken, validateCanvas, publicError } = await import('../server/connectors.js');
const { inQuietHours, reminderWindow, defaultSettings } = await import('../server/reminders.js');
test('AES-GCM encrypts secrets and rejects tampering', () => {
  const token = 'synthetic-test-value';
  const encrypted = store.seal(token);
  assert.equal(store.unseal(encrypted), token);
  assert.ok(!encrypted.includes(token));
  assert.notEqual(encrypted, store.seal(token));
  const tampered = Buffer.from(encrypted, 'base64'); tampered[13] ^= 1;
  assert.throws(() => store.unseal(tampered.toString('base64')));
});
test('concurrent updates retain all tasks and VAPID initialization is stable', async () => {
  await Promise.all(Array.from({ length: 5 }, (_, index) => store.update<number[]>('test-updates', [], values => [...values, index])));
  assert.deepEqual((await store.get<number[]>('test-updates', [])).sort(), [0, 1, 2, 3, 4]);
  const initialized = await Promise.all([store.getOrCreate('test-create', 'one'), store.getOrCreate('test-create', 'two')]);
  assert.equal(initialized[0], initialized[1]);
  assert.equal(await store.claim('test-lock', 'first', 10000), true);
  assert.equal(await store.claim('test-lock', 'second', 10000), false);
  await store.release('test-lock', 'second');
  assert.equal(await store.claim('test-lock', 'third', 10000), false);
  await store.release('test-lock', 'first');
  assert.equal(await store.claim('test-lock', 'third', 10000), true);
});
test('Canvas pagination follows next links and sends bearer only to approved API', async () => {
  const calls: string[] = [];
  const fetcher: typeof fetch = async (url, options) => {
    calls.push(String(url));
    assert.equal((options!.headers as Record<string, string>).Authorization, 'Bearer synthetic');
    assert.equal(options?.redirect, 'error');
    return calls.length === 1 ? new Response('[{"id":1}]', { headers: { link: '<https://umthcm.instructure.com/api/v1/courses?page=2>; rel="next"' } }) : new Response('[{"id":2}]');
  };
  assert.deepEqual(await pages('/api/v1/courses', 'synthetic', 'canvas', fetcher), [{ id: 1 }, { id: 2 }]);
  assert.equal(calls.length, 2);
  await assert.rejects(pages('https://evil.example/api/v1/courses', 'synthetic', 'canvas', fetcher));
  assert.equal(calls.length, 2);
});
test('external pagination cannot exfiltrate credentials', async () => {
  let calls = 0;
  await assert.rejects(pages('/api/v1/courses', 'synthetic', 'canvas', async () => { calls++; return new Response('[]', { headers: { link: '<https://evil.example/api/v1/courses>; rel="next"' } }); }));
  assert.equal(calls, 1);
});
test('pagination loops and provider access failures are surfaced', async () => {
  await assert.rejects(pages('/api/v1/courses', 'synthetic', 'canvas', async () => new Response('[]', { headers: { link: '<https://umthcm.instructure.com/api/v1/courses>; rel="next"' } })));
  await assert.rejects(pages('/api/v1/courses', 'synthetic', 'canvas', async () => new Response('{}', { status: 403 })), /quyền/);
});
test('a Canvas 401 does not claim a newly created token has expired or echo provider secrets', async () => {
  const synthetic = 'synthetic-test-credential';
  await assert.rejects(pages('/api/v1/users/self/profile', synthetic, 'canvas', async () => new Response(JSON.stringify({ errors: [{ message: synthetic }] }), { status: 401, headers: { 'www-authenticate': 'Bearer realm="canvas-lms"' } })), error => {
    const message = publicError(error);
    assert.match(message, /HTTP 401/);
    assert.match(message, /Chưa thể kết luận/);
    assert.ok(!message.includes(synthetic));
    assert.ok(!message.includes('Phiên kết nối hết hạn'));
    return true;
  });
});
test('Canvas reports missing scope separately from token rejection', async () => {
  await assert.rejects(pages('/api/v1/users/self/profile', 'synthetic', 'canvas', async () => new Response('{}', { status: 401, headers: { 'www-authenticate': 'Bearer error="insufficient_scope"' } })), /chưa cấp đủ quyền/);
});
test('Canvas token normalization accepts copied Bearer prefixes but rejects broken values without echoing them', () => {
  assert.equal(normalizeCanvasToken('  synthetic-test-token  '), 'synthetic-test-token');
  assert.equal(normalizeCanvasToken('Bearer synthetic-test-token'), 'synthetic-test-token');
  assert.equal(normalizeCanvasToken('bearer\tsynthetic-test-token'), 'synthetic-test-token');
  assert.throws(() => normalizeCanvasToken('synthetic test token'), /định dạng/);
  assert.throws(() => normalizeCanvasToken(undefined));
  assert.throws(() => normalizeCanvasToken('abc'));
});
test('Canvas validation rejects login HTML and empty profile responses', async () => {
  await assert.rejects(validateCanvas('synthetic', async () => new Response('<html>Login</html>')), /định dạng API/);
  await assert.rejects(validateCanvas('synthetic', async () => new Response('{}')), /định dạng API/);
  const profile = await validateCanvas('synthetic', async () => new Response('{"id":123,"name":"Test account"}'));
  assert.equal(profile.id, 123);
});
test('Graph pagination follows opaque nextLink', async () => {
  let calls = 0;
  assert.deepEqual(await pages('/v1.0/me/messages', 'synthetic', 'outlook', async () => new Response(JSON.stringify(++calls === 1 ? { value: [{ id: 1 }], '@odata.nextLink': 'https://graph.microsoft.com/v1.0/me/messages?$skip=opaque' } : { value: [{ id: 2 }] }))), [{ id: 1 }, { id: 2 }]);
});
test('unsafe content URLs are discarded', () => { assert.equal(safeUrl('javascript:alert(1)'), undefined); assert.equal(safeUrl('http://example.com'), undefined); assert.equal(safeUrl('https://example.com/a'), 'https://example.com/a'); });
test('quiet hours use configured timezone across midnight', () => {
  assert.equal(inQuietHours(new Date('2026-11-19T16:00:00Z'), defaultSettings), true);
  assert.equal(inQuietHours(new Date('2026-11-19T02:00:00Z'), defaultSettings), false);
  assert.equal(inQuietHours(new Date('2026-11-19T16:00:00Z'), { ...defaultSettings, quietStart: 7, quietEnd: 7 }), false);
});
test('reminders never invent due dates or notify completed/overdue/non-task items', () => {
  const now = Date.parse('2026-11-19T09:00:00Z');
  const item = { id: 'manual:test', title: 'Test', kind: 'task' as const, source: 'manual' as const, course: 'Test', due: new Date(now + 1800000).toISOString() };
  assert.equal(reminderWindow(item, now), '1h');
  assert.equal(reminderWindow({ ...item, due: new Date(now + 7200000).toISOString() }, now), '24h');
  assert.equal(reminderWindow({ ...item, completed: true }, now), null);
  assert.equal(reminderWindow({ ...item, due: null }, now), null);
  assert.equal(reminderWindow({ ...item, due: new Date(now - 1).toISOString() }, now), null);
  assert.equal(reminderWindow({ ...item, kind: 'mail' }, now), null);
});
test.after(() => { store.db?.close(); rmSync(directory, { recursive: true, force: true }); });
