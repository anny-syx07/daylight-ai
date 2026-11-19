import { ConfidentialClientApplication, CryptoProvider } from '@azure/msal-node';
import { get, set, secret, seal, remove, claim, release, update } from './store.js';
import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Item, Connection, Source } from '../src/types.js';
export const CANVAS = 'https://umthcm.instructure.com';
const GRAPH = 'https://graph.microsoft.com';
export const origin = (process.env.APP_ORIGIN || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:5173')).replace(/\/$/, '');
const syncBudget = new AsyncLocalStorage<number>();
export const microsoftReady = Boolean(process.env.MS_CLIENT_ID && process.env.MS_CLIENT_SECRET);
export const scopes = ['User.Read', 'Mail.Read', 'Calendars.Read'];
export const cryptoProvider = new CryptoProvider();
export function msal() {
    return new ConfidentialClientApplication({
        auth: { clientId: process.env.MS_CLIENT_ID || '', clientSecret: process.env.MS_CLIENT_SECRET, authority: `https://login.microsoftonline.com/${process.env.MS_TENANT_ID || 'organizations'}` },
        cache: { cachePlugin: {
                beforeCacheAccess: async (context) => { const cache = await secret('ms-cache'); if (cache)
                    context.tokenCache.deserialize(cache); },
                afterCacheAccess: async (context) => { if (context.cacheHasChanged)
                    await set('ms-cache', seal(context.tokenCache.serialize())); },
            } },
    });
}
export class ProviderError extends Error {
    constructor(public status: number, public provider: 'canvas' | 'outlook' = 'canvas', public reason: 'rejected' | 'scope' | 'response' = 'rejected') {
        const service = provider === 'canvas' ? 'Canvas' : 'Microsoft';
        super(reason === 'scope' ? `${service} chưa cấp đủ quyền đọc mục này (HTTP ${status}).` : reason === 'response' ? `${service} trả về nội dung ngoài định dạng API. Hãy kiểm tra trang Canvas của trường hoặc thử lại sau.` : status === 401 ? provider === 'canvas' ? `Canvas chưa chấp nhận token (HTTP 401). Chưa thể kết luận token hết hạn. Kiểm tra token được tạo tại ${CANVAS}, sao chép đầy đủ chuỗi Token rồi thử lại.` : 'Microsoft chưa chấp nhận phiên đăng nhập (HTTP 401). Hãy kết nối lại.' : status === 403 ? `${service} chưa cấp quyền cho tài khoản đọc mục này (HTTP 403).` : status === 429 ? 'Dịch vụ đang giới hạn lượt truy cập. Sẽ thử lại ở lần đồng bộ sau.' : `${service} trả về lỗi HTTP ${status}.`);
    }
}
export function normalizeCanvasToken(value: unknown): string {
    if (typeof value !== 'string' || value.length > 4096) throw new Error('Chỉ dán giá trị Access token từ Canvas.');
    const token = value.trim().replace(/^Bearer[ \t]+/i, '').trim();
    if (token.length < 10 || /[^\x21-\x7e]/.test(token)) throw new Error('Token chưa đúng định dạng. Chỉ dán chuỗi Token đầy đủ, không kèm khoảng trắng ở giữa.');
    return token;
}
export async function pages(path: string, token: string, provider: 'canvas' | 'outlook', fetcher: typeof fetch = fetch): Promise<any[]> {
    const base = provider === 'canvas' ? CANVAS : GRAPH;
    let next: string | undefined = new URL(path, base).href;
    const result: any[] = [];
    const visited = new Set<string>();
    while (next) {
        if (Date.now() > (syncBudget.getStore() || Infinity)) throw new Error('Sync time budget exceeded.');
        const target = new URL(next);
        if (target.origin !== base || !target.pathname.startsWith(provider === 'canvas' ? '/api/v1/' : '/v1.0/'))
            throw new Error('Đường dẫn phân trang không hợp lệ.');
        if (visited.has(next) || visited.size >= 200)
            throw new Error('Dữ liệu vượt giới hạn đồng bộ.');
        visited.add(next);
        const response: Response = await fetcher(next, { headers: { Authorization: `Bearer ${token}`, ...(provider === 'outlook' ? { Prefer: 'outlook.timezone="UTC"' } : {}) }, redirect: 'error', signal: AbortSignal.timeout(20000) });
        if (!response.ok) {
            const scopeDenied = /\berror\s*=\s*"?insufficient_scope\b/i.test(response.headers.get('www-authenticate') || '');
            throw new ProviderError(response.status, provider, scopeDenied ? 'scope' : 'rejected');
        }
        let body: any;
        try { body = await response.json(); }
        catch { throw new ProviderError(response.status, provider, 'response'); }
        result.push(...(Array.isArray(body) ? body : body.value || [body]));
        next = provider === 'outlook' ? body['@odata.nextLink'] : response.headers.get('link')?.match(/<([^>]+)>;\s*rel="next"/)?.[1];
    }
    return result;
}
export const safeUrl = (value: unknown) => { try {
    const url = new URL(String(value));
    return url.protocol === 'https:' ? url.href : undefined;
}
catch {
    return undefined;
} };
const date = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
const text = (value: unknown) => String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 600);
async function replacePartition(source: Source, partition: string, items: Item[]) { await set(`items:${source}:${partition}`, items); }
export async function allItems(): Promise<Item[]> {
    const partitions = await get<string[]>('partitions', []);
    const upstream = (await Promise.all(partitions.map(partition => get<Item[]>(`items:${partition}`, [])))).flat();
    const imports = await get<Item[]>('imported', []);
    const liveUrls = new Set(upstream.filter(item => item.url && item.due).map(item => `${item.url}|${item.due}`));
    return [...upstream, ...imports.filter(item => !item.url || !item.due || !liveUrls.has(`${item.url}|${item.due}`))];
}
async function savePartition(source: Source, partition: string, items: Item[]) {
    await replacePartition(source, partition, items);
    await update<string[]>('partitions', [], partitions => [...new Set([...partitions, `${source}:${partition}`])]);
}
export async function disconnect(source: 'canvas' | 'outlook') {
    const partitions = await get<string[]>('partitions', []);
    for (const partition of partitions.filter(value => value.startsWith(`${source}:`)))
        await remove(`items:${partition}`);
    await set('partitions', partitions.filter(value => !value.startsWith(`${source}:`)));
    for (const name of source === 'canvas' ? ['canvas-token'] : ['ms-cache', 'ms-account'])
        await remove(name);
    await set(`connection:${source}`, { connected: false });
}
export async function validateCanvas(token: string, fetcher: typeof fetch = fetch) {
    const profile = (await pages('/api/v1/users/self/profile', token, 'canvas', fetcher))[0];
    if (!profile || !Number.isInteger(profile.id) || profile.id <= 0) throw new ProviderError(200, 'canvas', 'response');
    return profile;
}
export async function syncCanvas() {
    const token = await secret('canvas-token');
    if (!token)
        return;
    const previous = await get<Connection>('connection:canvas', { connected: false });
    try {
        const profile = await validateCanvas(token);
        const courses = await pages('/api/v1/courses?enrollment_state=active&include[]=total_scores&per_page=100', token, 'canvas');
        const warnings: string[] = [];
        const activePartitions = new Set<string>();
        for (const course of courses) {
            if (!course.name)
                continue;
            const courseName = course.name;
            const base = `/api/v1/courses/${course.id}`;
            const assignmentIds = new Set<number>();
            const resources = [
                ['assignment', `${base}/assignments?include[]=submission&per_page=100`],
                ['quiz', `${base}/quizzes?per_page=100`],
                ['discussion', `${base}/discussion_topics?per_page=100`],
                ['announcement', `${base}/discussion_topics?only_announcements=true&per_page=100`],
                ['file', `${base}/files?per_page=100`],
                ['grade', `${base}/enrollments?user_id=self&type[]=StudentEnrollment&per_page=100`],
            ] as const;
            for (const [kind, path] of resources) {
                const partition = `${course.id}:${kind}`;
                activePartitions.add(`canvas:${partition}`);
                try {
                    const values = await pages(path, token, 'canvas');
                    if (kind === 'assignment')
                        for (const value of values)
                            assignmentIds.add(value.id);
                    await savePartition('canvas', partition, values.filter(value => (kind !== 'discussion' || !value.is_announcement) && (!['quiz', 'discussion'].includes(kind) || !assignmentIds.has(value.assignment_id))).map(value => ({
                        id: `canvas:${kind}:${course.id}:${value.id}`, source: 'canvas', kind: kind === 'assignment' && value.is_quiz_assignment ? 'quiz' : kind === 'assignment' && value.discussion_topic ? 'discussion' : kind, course: courseName,
                        title: kind === 'grade' ? `${courseName} · Điểm hiện tại` : text(value.name || value.title || value.display_name || 'Chưa có tiêu đề'),
                        due: date(value.due_at || (kind === 'discussion' ? value.assignment?.due_at : null)),
                        url: safeUrl(kind === 'file' ? `${CANVAS}/courses/${course.id}/files/${value.id}` : value.html_url || value.grades?.html_url),
                        detail: kind === 'grade' ? `Điểm: ${value.grades?.current_score ?? 'Chưa công bố'} · Xếp loại: ${value.grades?.current_grade ?? '—'}` : text(value.message || value.description || (kind === 'file' ? `${Math.round((value.size || 0) / 1024)} KB` : '')),
                        completed: Boolean(value.submission?.submitted_at || value.submission?.excused || ['submitted', 'graded'].includes(value.submission?.workflow_state)),
                    })));
                }
                catch (error) {
                    warnings.push(`${courseName} / ${kind}: ${publicError(error)}`);
                }
            }
        }
        activePartitions.add('canvas:events');
        try {
            const start = new Date(Date.now() - 30 * 86400000).toISOString();
            const end = new Date(Date.now() + 180 * 86400000).toISOString();
            const contexts = ['user_' + profile.id, ...courses.filter(course => course.name).map(course => 'course_' + course.id)];
            const events = [];
            for (let index = 0; index < contexts.length; index += 20)
                events.push(...await pages(`/api/v1/calendar_events?${new URLSearchParams([['type', 'event'], ['start_date', start], ['end_date', end], ['per_page', '100'], ...contexts.slice(index, index + 20).map(context => ['context_codes[]', context])])}`, token, 'canvas'));
            await savePartition('canvas', 'events', [...new Map(events.map(value => [value.id, value])).values()].map(value => ({ id: `canvas:event:${value.id}`, source: 'canvas', kind: 'event', title: text(value.title), due: date(value.start_at), course: value.context_name || 'Canvas', url: safeUrl(value.html_url), detail: text(value.description) })));
        }
        catch (error) {
            warnings.push(`Lịch: ${publicError(error)}`);
        }
        const partitions = await get<string[]>('partitions', []);
        for (const partition of partitions.filter(value => value.startsWith('canvas:') && !activePartitions.has(value)))
            await remove(`items:${partition}`);
        await set('partitions', partitions.filter(value => !value.startsWith('canvas:') || activePartitions.has(value)));
        await set('connection:canvas', { connected: true, name: profile.name, lastSync: new Date().toISOString(), warnings });
    }
    catch (error) {
        await set('connection:canvas', { ...previous, connected: false, error: publicError(error) });
    }
}
export async function syncOutlook() {
    const accountId = await get<string | null>('ms-account', null);
    if (!accountId)
        return;
    const previous = await get<Connection>('connection:outlook', { connected: false });
    try {
        const client = msal();
        const account = await client.getTokenCache().getAccountByHomeId(accountId);
        if (!account)
            throw new Error('Hãy đăng nhập Microsoft lại.');
        const result = await client.acquireTokenSilent({ account, scopes });
        if (!result?.accessToken)
            throw new Error('Hãy đăng nhập Microsoft lại.');
        const warnings: string[] = [];
        for (const kind of ['mail', 'event'] as const) {
            try {
                const start = new Date(Date.now() - 7 * 86400000).toISOString();
                const end = new Date(Date.now() + 180 * 86400000).toISOString();
                const path = kind === 'mail' ? '/v1.0/me/mailFolders/inbox/messages?$top=50&$orderby=receivedDateTime%20desc&$select=id,subject,bodyPreview,webLink,from,receivedDateTime&$filter=' + encodeURIComponent(`receivedDateTime ge ${new Date(Date.now() - 30 * 86400000).toISOString()}`) : `/v1.0/me/calendarView?startDateTime=${start}&endDateTime=${end}&$top=100&$select=id,subject,start,webLink,bodyPreview,isCancelled`;
                const values = await pages(path, result.accessToken, 'outlook');
                await savePartition('outlook', kind, values.filter(value => !value.isCancelled).map(value => ({ id: `outlook:${kind}:${value.id}`, source: 'outlook', kind, title: text(value.subject || '(Không có tiêu đề)'), course: kind === 'mail' ? text(value.from?.emailAddress?.name || 'Outlook') : 'Outlook Calendar', due: kind === 'event' ? date(value.start?.dateTime ? `${value.start.dateTime.replace(/Z$/, '')}Z` : null) : null, url: safeUrl(value.webLink), detail: text(value.bodyPreview) })));
            }
            catch (error) {
                warnings.push(`${kind}: ${publicError(error)}`);
            }
        }
        await set('connection:outlook', { connected: true, name: account.username, lastSync: new Date().toISOString(), warnings });
    }
    catch {
        await set('connection:outlook', { ...previous, connected: false, error: 'Không thể làm mới phiên Microsoft. Hãy kết nối lại; trường có thể cần cấp quyền.' });
    }
}
export function publicError(error: unknown) { return error instanceof ProviderError ? error.message : 'Chưa tải được dữ liệu. Kiểm tra kết nối và thử lại.'; }
let running: Promise<void> | null = null;
export const isSyncing = () => Boolean(running);
export function syncAll() {
    if (!running) running = (async () => {
        const owner = randomUUID();
        if (!await claim('lock:sync', owner, 280000)) return;
        try { await syncBudget.run(Date.now() + 230000, async () => { await syncCanvas(); await syncOutlook(); }); }
        finally { await release('lock:sync', owner); }
    })().finally(() => { running = null; });
    return running;
}
