import type { Item } from './types';

export const deadlineKinds = ['assignment', 'quiz', 'discussion', 'task'];
export const isDeadline = (item: Item) => deadlineKinds.includes(item.kind);
export const dayKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export const itemDayKey = (item: Item) => !item.due ? '' : item.allDay ? item.due.slice(0, 10) : dayKey(new Date(item.due));
export const dateFromKey = (key: string) => new Date(`${key}T12:00:00`);
export const shortTime = (item: Item) => item.allDay ? 'Cả ngày' : item.due ? new Date(item.due).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : 'Chưa có hạn';
export const chronological = (first: Item, second: Item) => (first.due ? Date.parse(first.due) : Infinity) - (second.due ? Date.parse(second.due) : Infinity);

export function studySummary(items: Item[], now = new Date()) {
  const work = items.filter(isDeadline);
  const pending = work.filter(item => !item.completed);
  const today = dayKey(now);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + index);
    const key = dayKey(date);
    const entries = items.filter(item => itemDayKey(item) === key && !item.completed && !item.cancelled);
    return { date, key, assignments: entries.filter(item => isDeadline(item) && item.kind !== 'quiz').length, quizzes: entries.filter(item => item.kind === 'quiz').length, classes: entries.filter(item => item.kind === 'event').length };
  });
  const upcoming = pending.filter(item => item.due && itemDayKey(item) >= today).sort(chronological);
  return {
    work, pending, days, upcoming,
    completed: work.filter(item => item.completed).length,
    today: pending.filter(item => itemDayKey(item) === today).length,
    assignments: pending.filter(item => item.kind === 'assignment').length,
    quizzes: pending.filter(item => item.kind === 'quiz').length,
    overdue: pending.filter(item => item.due && itemDayKey(item) < today).sort(chronological),
    undated: pending.filter(item => !item.due),
    classes: items.filter(item => item.kind === 'event' && !item.cancelled && item.due && (item.allDay ? itemDayKey(item) >= today : Date.parse(item.due) >= now.getTime())).sort(chronological),
  };
}
