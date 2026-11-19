import express from 'express';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { get, set, remove, seal } from './store.js';
import { allItems, syncAll, isSyncing, validateCanvas, disconnect, msal, cryptoProvider, microsoftReady, scopes, origin, publicError } from './connectors.js';
import { defaultSettings, pushKey, sendReminders } from './reminders.js';
import type { Item, Connection } from '../src/types.js';

const production = process.env.NODE_ENV === 'production';
const password = process.env.APP_PASSWORD;
if (production && (!password || password.length < 16 || !origin.startsWith('https://'))) throw new Error('Production requires APP_PASSWORD (16+ characters) and HTTPS APP_ORIGIN.');
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));
app.use((request, response, next) => {
  response.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'", 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()' });
  if (production) response.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  if (request.path.startsWith('/api')) response.set('Cache-Control', 'no-store');
  if (request.path.startsWith('/api') && !['GET', 'HEAD'].includes(request.method) && request.headers.origin !== origin) { response.status(403).json({ error: 'Nguồn yêu cầu không hợp lệ.' }); return; }
  next();
});
const digest = (value: string) => createHash('sha256').update(value).digest();
const cookieName = production ? '__Host-daylight' : 'daylight';
function sessionId(request: express.Request) { return request.headers.cookie?.split(';').map(value => value.trim()).find(value => value.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1) || ''; }
function authorized(request: express.Request) {
  if (!password) return true;
  const value = get<{ expires: number } | null>(`session:${digest(sessionId(request)).toString('hex')}`, null);
  return Boolean(value && value.expires > Date.now());
}
app.get('/api/health', (_request, response) => response.json({ ok: true }));
app.get('/api/session', (request, response) => response.json({ authenticated: authorized(request), passwordRequired: Boolean(password) }));
const attempts = new Map<string, { count: number; reset: number }>();
app.post('/api/login', (request, response) => {
  const address = request.socket.remoteAddress || 'unknown';
  const bucket = attempts.get(address) || { count: 0, reset: Date.now() + 900000 };
  if (bucket.reset < Date.now()) { bucket.count = 0; bucket.reset = Date.now() + 900000; }
  bucket.count++; attempts.set(address, bucket);
  if (bucket.count > 15) { response.status(429).json({ error: 'Đã thử nhiều lần. Vui lòng chờ 15 phút.' }); return; }
  if (!password || typeof request.body.password !== 'string' || !timingSafeEqual(digest(request.body.password), digest(password))) { response.status(401).json({ error: 'Mật khẩu chưa đúng.' }); return; }
  attempts.delete(address);
  const session = randomBytes(32).toString('hex');
  set(`session:${digest(session).toString('hex')}`, { expires: Date.now() + 7 * 86400000 });
  response.cookie(cookieName, session, { httpOnly: true, secure: production, sameSite: 'lax', path: '/', maxAge: 7 * 86400000 }).json({ ok: true });
});
app.use('/api', (request, response, next) => { if (!authorized(request)) { response.status(401).json({ error: 'Hãy đăng nhập để tiếp tục.' }); return; } next(); });
app.post('/api/logout', (request, response) => { remove(`session:${digest(sessionId(request)).toString('hex')}`); response.clearCookie(cookieName, { path: '/', secure: production, httpOnly: true, sameSite: 'lax' }).json({ ok: true }); });
app.get('/api/dashboard', (_request, response) => {
  const completed = get<Record<string, boolean>>('completed', {});
  const raw = [...allItems(), ...get<Item[]>('manual', [])];
  const assignments = new Set(raw.filter(item => item.kind === 'assignment' && item.url).map(item => item.url));
  const items = raw.filter(item => !(['quiz', 'discussion'].includes(item.kind) && item.url && assignments.has(item.url))).map(item => ({ ...item, completed: item.completed || completed[item.id] || false }));
  response.json({ items, connections: { canvas: get<Connection>('connection:canvas', { connected: false }), outlook: get<Connection>('connection:outlook', { connected: false }) }, settings: get('settings', defaultSettings), pushKey, microsoftReady, passwordRequired: Boolean(password) });
});
app.post('/api/connect/canvas', async (request, response) => {
  if (isSyncing()) { response.status(409).json({ error: 'Đang đồng bộ. Chờ một chút rồi kết nối lại nhé.' }); return; }
  const token = request.body.token;
  if (typeof token !== 'string' || token.trim().length < 10 || token.length > 4096 || /\s/.test(token.trim())) { response.status(400).json({ error: 'Nhập access token hợp lệ.' }); return; }
  try {
    const profile = await validateCanvas(token.trim());
    set('canvas-token', seal(token.trim()));
    set('connection:canvas', { connected: true, name: profile.name });
    void syncAll();
    response.json({ ok: true });
  } catch (error) { response.status(400).json({ error: publicError(error) }); }
});
app.delete('/api/connect/:source', (request, response) => { if (isSyncing()) { response.status(409).json({ error: 'Đang đồng bộ. Chờ một chút rồi ngắt kết nối nhé.' }); return; } if (!['canvas', 'outlook'].includes(request.params.source)) { response.sendStatus(400); return; } disconnect(request.params.source as 'canvas' | 'outlook'); response.json({ ok: true }); });
app.post('/api/sync', async (_request, response) => { await syncAll(); response.json({ ok: true }); });
app.get('/api/connect/outlook', async (request, response) => {
  if (!microsoftReady) { response.redirect('/?outlook=setup'); return; }
  const state = randomBytes(32).toString('hex');
  const codes = await cryptoProvider.generatePkceCodes();
  set(`oauth:${state}`, { verifier: codes.verifier, session: digest(sessionId(request)).toString('hex'), expires: Date.now() + 600000 });
  const url = await msal().getAuthCodeUrl({ scopes, redirectUri: `${origin}/api/oauth/microsoft`, state, codeChallenge: codes.challenge, codeChallengeMethod: 'S256', prompt: 'select_account' });
  response.redirect(url);
});
app.get('/api/oauth/microsoft', async (request, response) => {
  const state = typeof request.query.state === 'string' ? request.query.state : '';
  const pending = get<{ verifier: string; session: string; expires: number } | null>(`oauth:${state}`, null);
  remove(`oauth:${state}`);
  if (!pending || pending.expires < Date.now() || pending.session !== digest(sessionId(request)).toString('hex')) { response.redirect('/?outlook=state'); return; }
  if (request.query.error || typeof request.query.code !== 'string') { response.redirect('/?outlook=consent'); return; }
  try {
    const result = await msal().acquireTokenByCode({ code: request.query.code, scopes, codeVerifier: pending.verifier, redirectUri: `${origin}/api/oauth/microsoft` });
    if (!result.account) throw new Error('Missing account');
    set('ms-account', result.account.homeAccountId);
    set('connection:outlook', { connected: true, name: result.account.username });
    void syncAll();
    response.redirect('/?outlook=connected');
  } catch { response.redirect('/?outlook=failed'); }
});
app.post('/api/tasks', (request, response) => {
  const { title, due, course } = request.body;
  if (typeof title !== 'string' || !title.trim() || title.length > 300 || (due && !Number.isFinite(Date.parse(due)))) { response.status(400).json({ error: 'Kiểm tra tên và thời hạn.' }); return; }
  const item: Item = { id: `manual:${randomBytes(12).toString('hex')}`, source: 'manual', kind: 'task', title: title.trim(), due: due ? new Date(due).toISOString() : null, course: typeof course === 'string' ? course.slice(0, 100) : 'Cá nhân' };
  set('manual', [...get<Item[]>('manual', []), item]);
  response.json(item);
});
app.patch('/api/items/:id', (request, response) => {
  const id = request.params.id;
  if (![...allItems(), ...get<Item[]>('manual', [])].some(item => item.id === id)) { response.sendStatus(404); return; }
  if (typeof request.body.completed === 'boolean') set('completed', { ...get('completed', {}), [id]: request.body.completed });
  if (request.body.snooze === true) set('snoozes', { ...get('snoozes', {}), [id]: Date.now() + 3600000 });
  response.json({ ok: true });
});
app.delete('/api/tasks/:id', (request, response) => { set('manual', get<Item[]>('manual', []).filter(item => item.id !== request.params.id)); response.json({ ok: true }); });
app.patch('/api/settings', (request, response) => {
  const settings = { ...get('settings', defaultSettings), ...request.body };
  if (typeof settings.reminders !== 'boolean' || ![settings.quietStart, settings.quietEnd].every(value => Number.isInteger(value) && value >= 0 && value <= 23) || typeof settings.timezone !== 'string') { response.sendStatus(400); return; }
  try { new Intl.DateTimeFormat('en', { timeZone: settings.timezone }); } catch { response.sendStatus(400); return; }
  set('settings', { reminders: settings.reminders, quietStart: settings.quietStart, quietEnd: settings.quietEnd, timezone: settings.timezone });
  response.json({ ok: true });
});
app.post('/api/push', (request, response) => {
  const subscription = request.body;
  let target: URL;
  try { target = new URL(subscription.endpoint); } catch { response.sendStatus(400); return; }
  const hosts = ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com', 'wns.windows.com', 'notify.windows.com'];
  if (target.protocol !== 'https:' || target.port || target.username || target.password || !hosts.some(host => target.hostname === host || target.hostname.endsWith(`.${host}`)) || typeof subscription.keys?.p256dh !== 'string' || typeof subscription.keys?.auth !== 'string') { response.status(400).json({ error: 'Dịch vụ thông báo của trình duyệt chưa được hỗ trợ.' }); return; }
  set('subscriptions', [...get<any[]>('subscriptions', []).filter(value => value.endpoint !== subscription.endpoint), { endpoint: subscription.endpoint, keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth } }]);
  response.json({ ok: true });
});
app.use(express.static(resolve('dist'), { index: false }));
app.get('/{*path}', (_request, response) => { if (existsSync('dist/index.html')) response.sendFile('index.html', { root: resolve('dist') }); else response.status(404).send('Open http://localhost:5173 for development.'); });
app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => { response.status(500).json({ error: 'Có lỗi khi xử lý. Hãy thử lại.' }); });
const server = app.listen(Number(process.env.PORT || 3001), process.env.HOST || (production ? '0.0.0.0' : '127.0.0.1'), () => console.log('Daylight server ready'));
const syncTimer = setInterval(() => { void syncAll(); }, 10 * 60000);
const reminderTimer = setInterval(() => { void sendReminders(); }, 60000);
void syncAll();
process.on('SIGTERM', () => { clearInterval(syncTimer); clearInterval(reminderTimer); server.close(); });
