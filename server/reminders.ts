import webpush from 'web-push';
import { get, set, getOrCreate, update, claim, release, workspaceId } from './store.js';
import { createHash, randomUUID } from 'node:crypto';
import { allItems } from './connectors.js';
import type { Item } from '../src/types.js';
import { ownsDevice } from './push-devices.js';
export const defaultSettings = { reminders: false, quietStart: 22, quietEnd: 7, timezone: 'Asia/Ho_Chi_Minh' };
const keys = await getOrCreate('vapid', webpush.generateVAPIDKeys());
webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@example.com', keys.publicKey, keys.privateKey);
export const pushKey = keys.publicKey;
export type ReminderSettings = typeof defaultSettings;
export interface ReminderClockStatus { lastCheck?: string; nextCheck?: string; lastSent?: string; sent?: number; failed?: number; }
export function inQuietHours(now: Date, settings: typeof defaultSettings) {
    const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: settings.timezone, hour: '2-digit', hourCycle: 'h23' }).format(now));
    return settings.quietStart === settings.quietEnd ? false : settings.quietStart > settings.quietEnd ? hour >= settings.quietStart || hour < settings.quietEnd : hour >= settings.quietStart && hour < settings.quietEnd;
}
export function reminderWindow(item: Item, now: number) {
    if (!item.due || item.allDay || item.completed || item.cancelled || !['task', 'assignment', 'quiz', 'discussion', 'event'].includes(item.kind))
        return null;
    const remaining = Date.parse(item.due) - now;
    return remaining > 0 && remaining <= 3600000 ? '1h' : remaining > 3600000 && remaining <= 86400000 ? '24h' : null;
}
const sending = new Set<string>();
export async function sendReminders() {
    const workspace=workspaceId();
    if (sending.has(workspace))
        return;
    sending.add(workspace);
    const owner = randomUUID();
    const acquired = await claim('lock:reminders', owner, 180000).catch(error => { sending.delete(workspace); throw error; });
    if (!acquired) { sending.delete(workspace); return; }
    let sent = 0; let failed = 0;
    try {
        const settings = await get('settings', defaultSettings);
        if (!settings.reminders || inQuietHours(new Date(), settings))
            return;
        const overrides = await get<Record<string, boolean>>('completed', {});
        const subscriptions = await get<webpush.PushSubscription[]>('subscriptions', []);
        const items = [...await allItems(), ...await get<Item[]>('manual', [])];
        const snoozes = await get<Record<string, number>>('snoozes', {});
        for (const item of items) {
            const window = reminderWindow({ ...item, completed: item.completed || overrides[item.id] }, Date.now());
            if (!window || (snoozes[item.id] || 0) > Date.now())
                continue;
            for (const subscription of subscriptions) {
                if(!await ownsDevice(subscription.endpoint))continue;
                const key = `sent:${subscription.endpoint}:${item.id}:${item.due}:${window}:${snoozes[item.id] || 0}`;
                if (await get(key, false))
                    continue;
                try {
                    await webpush.sendNotification(subscription, JSON.stringify({ title: window === '1h' ? 'Còn dưới một giờ ☀️' : 'Nhắc nhẹ trước một ngày', body: `${item.title} · ${new Date(item.due!).toLocaleString('vi-VN', { timeZone: settings.timezone })}`, tag: `${item.id}:${window}`, url: '/' }), { TTL: Math.max(1, Math.min(3600, Math.floor((Date.parse(item.due!) - Date.now()) / 1000))), urgency: 'high', timeout: 15000 });
                    await set(key, true);
                    sent++;
                }
                catch (error) {
                    failed++;
                    if ([404, 410].includes((error as {
                        statusCode: number;
                    }).statusCode))
                    await update<webpush.PushSubscription[]>('subscriptions', [], values => values.filter(value => value.endpoint !== subscription.endpoint));
                }
            }
        }
        return { sent, failed };
    }
    finally {
        await release('lock:reminders', owner);
        sending.delete(workspace);
    }
}

/** Return only wake-up times, never subjects, school data or push credentials. */
export function nextReminderCheck(items: Item[], settings: ReminderSettings, now = Date.now(), retry = false) {
    let next = now + (retry ? 60000 : 600000);
    if (!settings.reminders) return next;
    if (inQuietHours(new Date(now), settings)) {
        // Check the exact quiet-hours boundary, including DST and non-hour timezones.
        for (let at = Math.floor(now / 60000) * 60000 + 60000; at <= now + 86400000; at += 60000) {
            if (!inQuietHours(new Date(at), settings)) { next = Math.min(next, at); break; }
        }
    }
    for (const item of items) {
        if (!item.due || item.allDay || item.completed || item.cancelled || !['task', 'assignment', 'quiz', 'discussion', 'event'].includes(item.kind)) continue;
        for (const offset of [86400000, 3600000]) {
            const at = Date.parse(item.due) - offset;
            if (at > now) next = Math.min(next, at);
        }
    }
    return next;
}
export async function runReminderClock() {
    const result = await sendReminders();
    const settings = await get('settings', defaultSettings);
    const completed = await get<Record<string, boolean>>('completed', {});
    const items = [...await allItems(), ...await get<Item[]>('manual', [])].map(item => ({ ...item, completed: item.completed || completed[item.id] }));
    const next = nextReminderCheck(items, settings, Date.now(), Boolean(result?.failed || (!result && settings.reminders && !inQuietHours(new Date(), settings))));
    await update<ReminderClockStatus>('reminder:clock', {}, previous => ({ ...previous, lastCheck: new Date().toISOString(), nextCheck: new Date(next).toISOString(), sent: result?.sent || 0, failed: result?.failed || 0, ...(result?.sent ? { lastSent: new Date().toISOString() } : {}) }));
    return { nextCheckAt: next };
}
export async function prepareTestPush(endpoint: unknown) {
    if (typeof endpoint !== 'string') throw new Error('Thiết bị này chưa đăng ký nhận thông báo.');
    const subscription = (await get<webpush.PushSubscription[]>('subscriptions', [])).find(value => value.endpoint === endpoint);
    if (!subscription || !await ownsDevice(subscription.endpoint)) throw new Error('Bật thông báo trên thiết bị này trước nhé.');
    const owner = randomUUID();
    if (!await claim(`push-test:${createEndpointKey(endpoint)}`, owner, 30000)) throw new Error('Chờ 30 giây trước khi thử lại nhé.');
    return async () => {
        if(await ownsDevice(subscription.endpoint)) await webpush.sendNotification(subscription, JSON.stringify({ title: 'Daylight · thử tiếng chuông 🔔', body: 'Bạn có nghe âm thanh và thấy thông báo này không?', tag: `test:${owner}`, url: '/app' }), { TTL: 120, urgency: 'high', timeout: 15000 });
        return { accepted: true };
    };
}
function createEndpointKey(endpoint: string) { return createHash('sha256').update(endpoint).digest('hex'); }
