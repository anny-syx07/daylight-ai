import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';

test('private API requires session and exact Origin; task changes persist and logout revokes access', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'daylight-http-'));
  const port = 31000 + Math.floor(Math.random() * 10000);
  const origin = `http://127.0.0.1:${port}`;
  const password = 'synthetic-test-password-only';
  const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], { env: { ...process.env, VERCEL: '', STORE_NAMESPACE: `test-http:${Date.now()}:`, NODE_ENV: 'test', PORT: String(port), APP_ORIGIN: origin, APP_PASSWORD: password, DATA_DIR: directory, MS_CLIENT_ID: '', MS_CLIENT_SECRET: '' }, stdio: 'ignore' });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 200; attempt++) {
      try { if ((await fetch(`${origin}/api/health`)).ok) { ready = true; break; } } catch {}
      await delay(100);
    }
    assert.ok(ready, 'server starts');
    assert.equal((await fetch(`${origin}/api/dashboard`)).status, 401);
    assert.equal((await fetch(`${origin}/api/cron`)).status, 401);
    assert.equal((await fetch(`${origin}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) })).status, 403);
    const login = await fetch(`${origin}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify({ password }) });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie')!;
    assert.match(cookie, /HttpOnly/i); assert.match(cookie, /SameSite=Lax/i);
    const headers = { 'Content-Type': 'application/json', Origin: origin, Cookie: cookie.split(';')[0] };
    const dashboard = await fetch(`${origin}/api/dashboard`, { headers });
    assert.equal(dashboard.headers.get('cache-control'), 'no-store');
    const initial = await dashboard.json();
    assert.deepEqual(initial.items, []);
    assert.equal(initial.connections.canvas.connected, false);
    assert.equal(initial.microsoftReady, false);
    assert.ok(!JSON.stringify(initial).includes(password));
    const invalidCanvas = await fetch(`${origin}/api/connect/canvas`, { method: 'POST', headers, body: JSON.stringify({ token: 'synthetic broken token' }) });
    assert.equal(invalidCanvas.status, 400);
    const canvasError = await invalidCanvas.json();
    assert.match(canvasError.error, /định dạng/);
    assert.ok(!JSON.stringify(canvasError).includes('synthetic broken token'));
    assert.equal((await fetch(`${origin}/api/tasks`, { method: 'POST', headers: { ...headers, Origin: 'https://evil.example' }, body: JSON.stringify({ title: 'Blocked' }) })).status, 403);
    const taskResponse = await fetch(`${origin}/api/tasks`, { method: 'POST', headers, body: JSON.stringify({ title: 'Test task', due: null, course: 'Test' }) });
    assert.equal(taskResponse.status, 200);
    const task = await taskResponse.json();
    await fetch(`${origin}/api/items/${encodeURIComponent(task.id)}`, { method: 'PATCH', headers, body: JSON.stringify({ completed: true }) });
    const updated = await (await fetch(`${origin}/api/dashboard`, { headers })).json();
    assert.equal(updated.items[0].completed, true);
    assert.equal(updated.items[0].due, null);
    assert.equal((await fetch(`${origin}/api/push`, { method: 'POST', headers, body: JSON.stringify({ endpoint: 'https://127.0.0.1/private', keys: { auth: 'test', p256dh: 'test' } }) })).status, 400);
    await fetch(`${origin}/api/tasks/${encodeURIComponent(task.id)}`, { method: 'DELETE', headers });
    assert.deepEqual((await (await fetch(`${origin}/api/dashboard`, { headers })).json()).items, []);
    assert.equal((await fetch(`${origin}/api/imports/gmail/receive`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: [] }) })).status, 401);
    assert.equal((await fetch(`${origin}/api/imports/gmail/setup`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: '{}' })).status, 401);
    assert.equal((await fetch(`${origin}/api/imports/gmail/setup`, { method: 'POST', headers: { ...headers, Origin: 'https://evil.example' }, body: '{}' })).status, 403);
    const setup = await (await fetch(`${origin}/api/imports/gmail/setup`, { method: 'POST', headers, body: '{}' })).json();
    const config = JSON.parse(setup.code.match(/const DAYLIGHT = (.+);/)[1]);
    const inboundHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${config.key}` };
    const receive = () => fetch(`${origin}/api/imports/gmail/receive`, { method: 'POST', headers: inboundHeaders, body: JSON.stringify({ messages: [{ id: 'abcd1234', subject: 'Test notice', from: 'Teacher', snippet: 'Tomorrow' }] }) });
    assert.equal((await receive()).status, 200);
    assert.equal((await receive()).status, 200);
    const imported = await (await fetch(`${origin}/api/dashboard`, { headers })).json();
    assert.equal(imported.items.length, 1);
    assert.equal(imported.items[0].source, 'import');
    assert.equal(imported.items[0].due, null);
    assert.equal(imported.connections.outlook.connected, false);
    assert.equal(imported.imports.gmail.receivedCount, 1);
    assert.ok(!JSON.stringify(imported).includes(config.key));
    await fetch(`${origin}/api/imports/gmail/setup`, { method: 'DELETE', headers });
    assert.equal((await receive()).status, 401);
    const emailContent = Buffer.from('From: test@example.edu\r\nSubject: Imported email\r\n\r\n' + 'x'.repeat(40000)).toString('base64');
    const preview = await (await fetch(`${origin}/api/imports/preview`, { method: 'POST', headers, body: JSON.stringify({ filename: 'test.eml', content: emailContent }) })).json();
    assert.ok(preview.id);
    assert.equal((await (await fetch(`${origin}/api/dashboard`, { headers })).json()).items.length, 1);
    assert.equal((await fetch(`${origin}/api/imports/confirm`, { method: 'POST', headers, body: JSON.stringify({ id: preview.id }) })).status, 200);
    assert.equal((await (await fetch(`${origin}/api/dashboard`, { headers })).json()).items.length, 2);
    for (const item of (await (await fetch(`${origin}/api/dashboard`, { headers })).json()).items) await fetch(`${origin}/api/imports/items/${encodeURIComponent(item.id)}`, { method: 'DELETE', headers });
    await fetch(`${origin}/api/logout`, { method: 'POST', headers });
    assert.equal((await fetch(`${origin}/api/dashboard`, { headers })).status, 401);
  } finally {
    const stopped = new Promise<void>(resolve => child.once('exit', () => resolve()));
    child.kill('SIGTERM'); await stopped;
    rmSync(directory, { recursive: true, force: true });
  }
});
