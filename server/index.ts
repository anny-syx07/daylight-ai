import express from 'express';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { waitUntil } from '@vercel/functions';
import { get, set, remove, seal, update, inWorkspace,eraseMemberData,workspaceId,claim,release } from './store.js';
import { allItems, syncAll, isSyncing, validateCanvas, normalizeCanvasToken, ProviderError, disconnect, msal, cryptoProvider, microsoftReady, scopes, origin, publicError,canvasOrigin } from './connectors.js';
import { normalizeCanvasAddress } from '../src/canvasAddress.js';
import { defaultSettings, pushKey, sendReminders, runReminderClock, prepareTestPush } from './reminders.js';
import type { Item, Connection } from '../src/types.js';
import { previewImport, commitImport, importStatus, gmailAuthorized, receiveGmail, gmailSetup, revokeGmail } from './imports.js';
import { sisAuthorized, sisSetup, receiveSis, revokeSis } from './sis-bridge.js';
import { canvasAutomation, maybeAutoSyncCanvas } from './auto-sync.js';
import { collectNewMessages, deliverNewMessages, notificationStatus,discardCanvasMessages } from './notifications.js';
import { bindDevice, unbindDevice,ownsDevice } from './push-devices.js';
import { memberAuthReady, memberIdentity, memberAuthProxy, hasMemberCookie, clearMemberCookies, revokeMemberSession, bridgeWorkspace } from './member-auth.js';
const production = process.env.NODE_ENV === 'production';
const serverless = Boolean(process.env.VERCEL);
const password = process.env.APP_PASSWORD;
if (production && (!password || password.length < 16 || !origin.startsWith('https://')))
    throw new Error('Production requires APP_PASSWORD (16+ characters) and HTTPS APP_ORIGIN.');
const app = express();
app.disable('x-powered-by');
app.use('/api/auth',express.raw({type:'*/*',limit:'32kb'}));
app.use('/api/imports/preview', express.json({ limit: '1500kb' }));
app.use('/api/imports/sis/receive', express.json({ limit: '1mb' }));
app.use(express.json({ limit: '32kb' }));
app.use((request, response, next) => {
    response.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'", 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()' });
    if (production)
        response.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    if (request.path.startsWith('/api'))
        response.set('Cache-Control', 'no-store');
    if (request.path.startsWith('/api') && !['GET', 'HEAD'].includes(request.method) && request.headers.origin !== origin && !(request.method === 'POST' && ['/api/imports/gmail/receive', '/api/imports/sis/receive', '/api/reminders/tick'].includes(request.path))) {
        response.status(403).json({ error: 'Nguồn yêu cầu không hợp lệ.' });
        return;
    }
    next();
});
const digest = (value: string) => createHash('sha256').update(value).digest();
const cookieName = production ? '__Host-daylight' : 'daylight';
function sessionId(request: express.Request) { return request.headers.cookie?.split(';').map(value => value.trim()).find(value => value.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1) || ''; }
async function authorized(request: express.Request) {
    if (!password)
        return true;
    const value = await get<{
        expires: number;
    } | null>(`session:${digest(sessionId(request)).toString('hex')}`, null);
    return Boolean(value && value.expires > Date.now());
}
async function identity(request:express.Request,response:express.Response) {
    if(hasMemberCookie(request)) return memberIdentity(request,response);
    if(await inWorkspace('owner',()=>authorized(request))) return {workspace:'owner',name:'Góc nhỏ của bạn',kind:'owner' as const};
    return null;
}
app.all('/api/auth/{*path}', async(request,response)=>{
    if(request.method==='POST' && /\/(sign-in\/email|sign-up\/email|sign-out)$/.test(request.path)) {
        await inWorkspace('owner',()=>remove(`session:${digest(sessionId(request)).toString('hex')}`));
        response.clearCookie(cookieName,{path:'/',secure:production,httpOnly:true,sameSite:'lax'});
    }
    try{await memberAuthProxy(request,response);}catch{response.status(503).json({error:'Chưa kết nối được dịch vụ đăng nhập. Hãy thử lại.'});}
});
app.use(['/api/imports/gmail/receive','/api/reminders/tick','/api/imports/sis/receive'],async(request,_response,next)=>{
    const workspace=await bridgeWorkspace(request.originalUrl.includes('/sis/')?'sis':'gmail',request.headers.authorization);
    inWorkspace(workspace,()=>next());
});
app.get('/api/health', (_request, response) => response.json({ ok: true }));
app.get('/api/cron', async (request, response) => {
    const expected = process.env.CRON_SECRET;
    if (!expected || !timingSafeEqual(digest(request.headers.authorization || ''), digest(`Bearer ${expected}`))) { response.sendStatus(401); return; }
    await collectNewMessages();
    await maybeAutoSyncCanvas();
    await collectNewMessages();
    waitUntil(deliverNewMessages().catch(() => {}));
    await sendReminders();
    response.json({ ok: true });
});
app.get('/api/session', async (request, response) => { try { const user=await identity(request,response);response.json({authenticated:Boolean(user),passwordRequired:Boolean(password),memberAuthReady,user:user?{name:user.name,kind:user.kind}:null}); }catch{response.status(503).json({error:'Chưa kiểm tra được phiên đăng nhập.'});} });
app.post('/api/imports/gmail/receive', async (request, response) => {
    if (!await gmailAuthorized(request.headers.authorization)) { response.sendStatus(401); return; }
    try { await collectNewMessages(); const result = await receiveGmail(request.body); await collectNewMessages(); waitUntil(deliverNewMessages().catch(() => {})); response.json(result); }
    catch { response.status(400).json({ error: 'Gói email không hợp lệ hoặc đã đạt giới hạn lưu trữ.' }); }
});
app.post('/api/imports/sis/receive', async (request, response) => {
    if (!await sisAuthorized(request.headers.authorization)) { response.sendStatus(401); return; }
    try { const result = await receiveSis(request.body); if (!request.body.error) await sendReminders().catch(() => {}); response.json(result); }
    catch { response.status(400).json({ error: 'Chưa đọc đủ lịch SIS hoặc phiên kiểm tra đã cũ. Lịch đang lưu được giữ nguyên.' }); }
});
app.post('/api/reminders/tick', async (request, response) => {
    if (!await gmailAuthorized(request.headers.authorization)) { response.sendStatus(401); return; }
    const clock = await runReminderClock();
    await collectNewMessages();
    const news = await notificationStatus();
    waitUntil(Promise.allSettled([deliverNewMessages(), maybeAutoSyncCanvas().then(async () => { await collectNewMessages(); await deliverNewMessages(); await sendReminders(); })]));
    response.json({ nextCheckAt: news.pending && news.devices && !news.quiet && news.enabled ? Math.min(clock.nextCheckAt, Math.max(Date.now() + 60000, news.nextRetry || 0)) : clock.nextCheckAt });
});
app.post('/api/login', async (request, response) => {
    const bucket = await update('login-attempts', { count: 0, reset: 0 }, previous => previous.reset < Date.now() ? { count: 1, reset: Date.now() + 900000 } : { ...previous, count: previous.count + 1 });
    if (bucket.count > 15) {
        response.status(429).json({ error: 'Đã thử nhiều lần. Vui lòng chờ 15 phút.' });
        return;
    }
    if (!password || typeof request.body.password !== 'string' || !timingSafeEqual(digest(request.body.password), digest(password))) {
        response.status(401).json({ error: 'Mật khẩu chưa đúng.' });
        return;
    }
    await remove('login-attempts');
    await revokeMemberSession(request);clearMemberCookies(request,response);
    const session = randomBytes(32).toString('hex');
    await set(`session:${digest(session).toString('hex')}`, { expires: Date.now() + 7 * 86400000 });
    response.cookie(cookieName, session, { httpOnly: true, secure: production, sameSite: 'lax', path: '/', maxAge: 7 * 86400000 }).json({ ok: true });
});
app.use('/api', async (request, response, next) => { let user;try{user=await identity(request,response);}catch{response.status(503).json({error:'Chưa kiểm tra được phiên đăng nhập.'});return;} if (!user) {
    response.status(401).json({ error: 'Hãy đăng nhập để tiếp tục.' });
    return;
} inWorkspace(user.workspace,()=>next()); });
app.post('/api/logout', async (request, response) => { await unbindDevice(request.body?.endpoint);await inWorkspace('owner',()=>remove(`session:${digest(sessionId(request)).toString('hex')}`));await revokeMemberSession(request);clearMemberCookies(request,response); response.clearCookie(cookieName, { path: '/', secure: production, httpOnly: true, sameSite: 'lax' }).json({ ok: true }); });
app.get('/api/dashboard', async (_request, response) => {
    const completed = await get<Record<string, boolean>>('completed', {});
    const raw = [...await allItems(), ...await get<Item[]>('manual', [])];
    const assignments = new Set(raw.filter(item => item.kind === 'assignment' && item.url).map(item => item.url));
    const items = raw.filter(item => !(['quiz', 'discussion'].includes(item.kind) && item.url && assignments.has(item.url))).map(item => ({ ...item, completed: item.completed || completed[item.id] || false }));
    response.json({ items, connections: { canvas: { ...await get<Connection>('connection:canvas', { connected: false }), canvasUrl:await get('canvas-token',null)?await canvasOrigin():undefined, diagnostic: await get('canvas:last-check', null) }, outlook: await get<Connection>('connection:outlook', { connected: false }) }, imports: await importStatus(), automation: { canvas: await canvasAutomation() }, notifications: await notificationStatus(), settings: await get('settings', defaultSettings), reminderClock: await get('reminder:clock', null), pushKey, microsoftReady, passwordRequired: Boolean(password), serverless });
});
app.post('/api/push/status',async(request,response)=>response.json({registered:typeof request.body.endpoint==='string' && await ownsDevice(request.body.endpoint) && (await get<any[]>('subscriptions',[])).some(s=>s.endpoint===request.body.endpoint)}));
app.delete('/api/workspace',async(request,response)=>{if(workspaceId()==='owner'||request.body.confirm!=='DELETE'){response.sendStatus(400);return;}if(isSyncing()){response.status(409).json({error:'Đợi lần đồng bộ đang chạy hoàn tất rồi xóa nhé.'});return;}try{for(const sub of await get<any[]>('subscriptions',[]))await unbindDevice(sub.endpoint);await revokeGmail();await revokeSis();await eraseMemberData();response.json({ok:true});}catch{response.status(400).json({error:'Chưa xóa được. Hãy thử lại.'});}});
app.patch('/api/automation/canvas', async (request, response) => {
    if (typeof request.body.enabled !== 'boolean') { response.sendStatus(400); return; }
    await set('automation:canvas-enabled', request.body.enabled);
    if (request.body.enabled) waitUntil(collectNewMessages().then(() => maybeAutoSyncCanvas()).then(async () => { await collectNewMessages(); await deliverNewMessages(); await sendReminders(); }).catch(() => {}));
    response.json({ enabled: request.body.enabled });
});
app.post('/api/imports/preview', async (request, response) => {
    try { response.json(await previewImport(request.body.filename, request.body.content)); }
    catch (error) { response.status(400).json({ error: error instanceof Error && /^(Chọn|Tệp|Email|Chỉ|Mỗi|Múi|Lịch)/.test(error.message) ? error.message : 'Chưa đọc được tệp. Hãy xuất lại lịch hoặc email và thử lại.' }); }
});
app.post('/api/imports/confirm', async (request, response) => {
    try { const result = await commitImport(request.body.id); await sendReminders().catch(() => {}); response.json(result); }
    catch (error) { response.status(400).json({ error: error instanceof Error && /^(Bản xem trước|Góc nhập)/.test(error.message) ? error.message : 'Chưa lưu được dữ liệu. Hãy thử lại.' }); }
});
app.delete('/api/imports/items/:id', async (request, response) => {
    await update<Item[]>('imported', [], items => items.filter(item => item.id !== request.params.id));
    response.json({ ok: true });
});
app.get('/api/imports/gmail/setup', async (_request, response) => response.json(await gmailSetup(origin)));
app.post('/api/imports/sis/setup', async (_request, response) => {
    try {
        const bytes = await sisSetup(origin);
        response.set('Content-Type', 'application/zip').set('Content-Disposition', 'attachment; filename="Daylight-SIS.zip"').send(Buffer.from(bytes));
    } catch { response.status(400).json({ error: 'Nhập lại tệp thời khóa biểu SIS trước khi tải cầu nối nhé.' }); }
});
app.delete('/api/imports/sis/setup', async (_request, response) => { await revokeSis(); response.json({ ok: true }); });
app.post('/api/imports/gmail/setup', async (_request, response) => response.json(await gmailSetup(origin, true)));
app.delete('/api/imports/gmail/setup', async (_request, response) => {
    await revokeGmail();
    response.json({ ok: true });
});
app.post('/api/connect/canvas', async (request, response) => {
    let token:string,canvasUrl:string;
    try {
        token=normalizeCanvasToken(request.body.token);
        canvasUrl=normalizeCanvasAddress(request.body.canvasUrl ?? (await get('canvas-token',null)?await canvasOrigin():''));
    } catch(error){response.status(400).json({error:(error as Error).message});return;}
    const lease=randomBytes(16).toString('hex');
    if(isSyncing()||!await claim('lock:sync',lease,280000)){response.status(409).json({error:'Đang đồng bộ. Chờ một chút rồi kết nối lại nhé.'});return;}
    let connected=false;
    try {
        const profile=await validateCanvas(token,undefined,canvasUrl);
        if(canvasUrl!==await canvasOrigin()){
            await discardCanvasMessages(await allItems());
            await disconnect('canvas');
            for(const name of ['completed','snoozes'])await update<Record<string,unknown>>(name,{},values=>Object.fromEntries(Object.entries(values).filter(([id])=>!id.startsWith('canvas:'))));
        }
        await set('canvas-origin',canvasUrl);
        await set('canvas-token',seal(token));
        await set('canvas:last-check',{checkedAt:new Date().toISOString(),ok:true,httpStatus:200});
        await set('connection:canvas',{connected:true,canvasUrl,name:profile.name});
        connected=true;
    }catch(error){
        const diagnostic={checkedAt:new Date().toISOString(),ok:false,httpStatus:error instanceof ProviderError?error.status:null,reason:error instanceof ProviderError?error.reason:'network'};
        await set('canvas:last-check',diagnostic);response.status(400).json({error:publicError(error),diagnostic});
    }finally{await release('lock:sync',lease);}
    if(!connected)return;
    if(serverless)await syncAll();else void syncAll();
    response.json({ok:true});
});
app.delete('/api/connect/:source',async(request,response)=>{
    if(!['canvas','outlook'].includes(request.params.source)){response.sendStatus(400);return;}
    const lease=randomBytes(16).toString('hex');
    if(isSyncing()||!await claim('lock:sync',lease,280000)){response.status(409).json({error:'Đang đồng bộ. Chờ một chút rồi ngắt kết nối nhé.'});return;}
    try{await disconnect(request.params.source as 'canvas'|'outlook');response.json({ok:true});}finally{await release('lock:sync',lease);}
});
app.post('/api/sync', async (_request, response) => { await collectNewMessages(); await syncAll(); await collectNewMessages(); waitUntil(deliverNewMessages().catch(() => {})); await sendReminders(); response.json({ ok: true }); });
app.post('/api/notifications/scan', async (_request, response) => { await collectNewMessages(); waitUntil(deliverNewMessages().catch(() => {})); response.json(await notificationStatus()); });
app.patch('/api/notifications/settings', async (request, response) => { if(typeof request.body.enabled!=='boolean'){response.sendStatus(400);return;} await set('notifications:enabled',request.body.enabled); response.json({enabled:request.body.enabled}); });
app.post('/api/reminders/check', async (_request, response) => { await sendReminders(); response.json({ ok: true }); });
app.post('/api/push/test', async (request, response) => {
    try {
        const send = await prepareTestPush(request.body.endpoint);
        const work = delay(15000).then(send).then(async () => { await set('push:last-test', { sentAt: new Date().toISOString(), accepted: true }); }).catch(async () => { await set('push:last-test', { sentAt: new Date().toISOString(), accepted: false }); });
        waitUntil(work);
        response.status(202).json({ queued: true, delaySeconds: 15 });
    }
    catch { response.status(400).json({ error: 'Chưa gửi được thông báo thử. Bật thông báo trên thiết bị này, hoặc đợi 30 giây rồi thử lại.' }); }
});
app.get('/api/connect/outlook', async (request, response) => {
    if (!microsoftReady) {
        response.redirect('/?outlook=setup');
        return;
    }
    const state = randomBytes(32).toString('hex');
    const codes = await cryptoProvider.generatePkceCodes();
    await set(`oauth:${state}`, { verifier: codes.verifier, session: digest(sessionId(request)).toString('hex'), expires: Date.now() + 600000 });
    const url = await msal().getAuthCodeUrl({ scopes, redirectUri: `${origin}/api/oauth/microsoft`, state, codeChallenge: codes.challenge, codeChallengeMethod: 'S256', prompt: 'select_account' });
    response.redirect(url);
});
app.get('/api/oauth/microsoft', async (request, response) => {
    const state = typeof request.query.state === 'string' ? request.query.state : '';
    const pending = await get<{
        verifier: string;
        session: string;
        expires: number;
    } | null>(`oauth:${state}`, null);
    await remove(`oauth:${state}`);
    if (!pending || pending.expires < Date.now() || pending.session !== digest(sessionId(request)).toString('hex')) {
        response.redirect('/?outlook=state');
        return;
    }
    if (request.query.error || typeof request.query.code !== 'string') {
        response.redirect('/?outlook=consent');
        return;
    }
    try {
        const result = await msal().acquireTokenByCode({ code: request.query.code, scopes, codeVerifier: pending.verifier, redirectUri: `${origin}/api/oauth/microsoft` });
        if (!result.account)
            throw new Error('Missing account');
        await set('ms-account', result.account.homeAccountId);
        await set('connection:outlook', { connected: true, name: result.account.username });
        if (serverless) await syncAll(); else void syncAll();
        response.redirect('/?outlook=connected');
    }
    catch {
        response.redirect('/?outlook=failed');
    }
});
app.post('/api/tasks', async (request, response) => {
    const { title, due, course } = request.body;
    const kind = request.body.kind || 'task';
    if (typeof title !== 'string' || !title.trim() || title.length > 300 || !['task', 'assignment', 'quiz', 'event'].includes(kind) || (due && (typeof due !== 'string' || !Number.isFinite(Date.parse(due)))) || (kind === 'event' && !due)) {
        response.status(400).json({ error: 'Kiểm tra tên và thời hạn.' });
        return;
    }
    const item: Item = { id: `manual:${randomBytes(12).toString('hex')}`, source: 'manual', kind, title: title.trim(), due: due ? new Date(due).toISOString() : null, course: typeof course === 'string' ? course.slice(0, 100) : 'Cá nhân' };
    await update<Item[]>('manual', [], items => [...items, item]);
    await sendReminders().catch(() => {});
    response.json(item);
});
app.patch('/api/items/:id', async (request, response) => {
    const id = request.params.id;
    if (![...await allItems(), ...await get<Item[]>('manual', [])].some(item => item.id === id)) {
        response.sendStatus(404);
        return;
    }
    if (typeof request.body.completed === 'boolean')
        await update<Record<string, boolean>>('completed', {}, completed => ({ ...completed, [id]: request.body.completed }));
    if (request.body.snooze === true)
        await update<Record<string, number>>('snoozes', {}, snoozes => ({ ...snoozes, [id]: Date.now() + 3600000 }));
    response.json({ ok: true });
});
app.delete('/api/tasks/:id', async (request, response) => { await update<Item[]>('manual', [], items => items.filter(item => item.id !== request.params.id)); response.json({ ok: true }); });
app.patch('/api/settings', async (request, response) => {
    const settings = { ...await get('settings', defaultSettings), ...request.body };
    if (typeof settings.reminders !== 'boolean' || ![settings.quietStart, settings.quietEnd].every(value => Number.isInteger(value) && value >= 0 && value <= 23) || typeof settings.timezone !== 'string') {
        response.sendStatus(400);
        return;
    }
    try {
        new Intl.DateTimeFormat('en', { timeZone: settings.timezone });
    }
    catch {
        response.sendStatus(400);
        return;
    }
    await set('settings', { reminders: settings.reminders, quietStart: settings.quietStart, quietEnd: settings.quietEnd, timezone: settings.timezone });
    response.json({ ok: true });
});
app.post('/api/push', async (request, response) => {
    const subscription = request.body;
    let target: URL;
    try {
        target = new URL(subscription.endpoint);
    }
    catch {
        response.sendStatus(400);
        return;
    }
    const hosts = ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com', 'wns.windows.com', 'notify.windows.com'];
    if (target.protocol !== 'https:' || target.port || target.username || target.password || !hosts.some(host => target.hostname === host || target.hostname.endsWith(`.${host}`)) || typeof subscription.keys?.p256dh !== 'string' || typeof subscription.keys?.auth !== 'string') {
        response.status(400).json({ error: 'Dịch vụ thông báo của trình duyệt chưa được hỗ trợ.' });
        return;
    }
    await bindDevice({ endpoint: subscription.endpoint, keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth } });
    response.json({ ok: true });
});
app.use(express.static(resolve('dist'), { index: false }));
app.get('/{*path}', (_request, response) => { if (existsSync('dist/index.html'))
    response.sendFile('index.html', { root: resolve('dist') });
else
    response.status(404).send('Open http://localhost:5173 for development.'); });
app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => { response.status(500).json({ error: 'Có lỗi khi xử lý. Hãy thử lại.' }); });
export default app;
if (!serverless) {
    const server = app.listen(Number(process.env.PORT || 3001), process.env.HOST || (production ? '0.0.0.0' : '127.0.0.1'), () => console.log('Daylight server ready'));
    const syncTimer = setInterval(() => { void maybeAutoSyncCanvas().catch(() => {}); }, 60000);
    const reminderTimer = setInterval(() => { void sendReminders(); }, 60000);
    const newsTimer = setInterval(() => { void collectNewMessages().then(deliverNewMessages).catch(() => {}); }, 60000);
    void maybeAutoSyncCanvas().catch(() => {});
    process.on('SIGTERM', () => { clearInterval(syncTimer); clearInterval(reminderTimer); clearInterval(newsTimer); server.close(); });
}
