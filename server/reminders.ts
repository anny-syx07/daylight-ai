import webpush from 'web-push';
import { get, set } from './store.js';
import { allItems } from './connectors.js';
import type { Item } from '../src/types.js';
export const defaultSettings = { reminders: false, quietStart: 22, quietEnd: 7, timezone: 'Asia/Ho_Chi_Minh' };
const keys = get('vapid', webpush.generateVAPIDKeys());
set('vapid', keys);
webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@example.com', keys.publicKey, keys.privateKey);
export const pushKey = keys.publicKey;
export function inQuietHours(now: Date, settings: typeof defaultSettings) {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: settings.timezone, hour: '2-digit', hourCycle: 'h23' }).format(now));
  return settings.quietStart === settings.quietEnd ? false : settings.quietStart > settings.quietEnd ? hour >= settings.quietStart || hour < settings.quietEnd : hour >= settings.quietStart && hour < settings.quietEnd;
}
export function reminderWindow(item: Item, now: number) {
  if (!item.due || item.completed || !['task', 'assignment', 'quiz', 'discussion', 'event'].includes(item.kind)) return null;
  const remaining = Date.parse(item.due) - now;
  return remaining > 0 && remaining <= 3600000 ? '1h' : remaining > 3600000 && remaining <= 86400000 ? '24h' : null;
}
let sending = false;
export async function sendReminders() {
  if (sending) return;
  sending = true;
  try {
    const settings = get('settings', defaultSettings);
    if (!settings.reminders || inQuietHours(new Date(), settings)) return;
    const overrides = get<Record<string, boolean>>('completed', {});
    const subscriptions = get<webpush.PushSubscription[]>('subscriptions', []);
    const items = [...allItems(), ...get<Item[]>('manual', [])];
    const snoozes = get<Record<string, number>>('snoozes', {});
    for (const item of items) {
      const window = reminderWindow({ ...item, completed: item.completed || overrides[item.id] }, Date.now());
      if (!window || (snoozes[item.id] || 0) > Date.now()) continue;
      for (const subscription of subscriptions) {
        const key = `sent:${subscription.endpoint}:${item.id}:${item.due}:${window}:${snoozes[item.id] || 0}`;
        if (get(key, false)) continue;
        try {
          await webpush.sendNotification(subscription, JSON.stringify({ title: window === '1h' ? 'Sắp đến giờ rồi ☀️' : 'Một việc cho ngày mai', body: `${item.title} · ${new Date(item.due!).toLocaleString('vi-VN', { timeZone: settings.timezone })}`, tag: item.id, url: '/' }), { TTL: 3600 });
          set(key, true);
        } catch (error) {
          if ([404, 410].includes((error as { statusCode: number }).statusCode)) set('subscriptions', get<webpush.PushSubscription[]>('subscriptions', []).filter(value => value.endpoint !== subscription.endpoint));
        }
      }
    }
  } finally { sending = false; }
}
