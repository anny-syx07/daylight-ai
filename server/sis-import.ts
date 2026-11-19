import { createHash } from 'node:crypto';
import type { Item, ImportPreview } from '../src/types.js';

const clean = (value: unknown, limit: number) => typeof value === 'string' ? value.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, limit) : '';
function timestamp(date: unknown, time: string) {
  const parts = typeof date === 'string' && date.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!parts || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('Lịch SIS có ngày hoặc giờ chưa hợp lệ.');
  const day = `${parts[3]}-${parts[2]}-${parts[1]}`;
  const utc = new Date(`${day}T${time}:00+07:00`);
  if (!Number.isFinite(utc.getTime()) || new Date(`${day}T12:00:00Z`).toISOString().slice(0, 10) !== day) throw new Error('Lịch SIS có ngày không tồn tại.');
  return utc.toISOString();
}

export function parseSisSchedule(input: unknown): Omit<ImportPreview, 'id'> {
  const data = input as { schema?: unknown; term?: unknown; timezone?: unknown; courses?: unknown } | null;
  if (!data || data.schema !== 'daylight.sis-schedule.v1' || typeof data.term !== 'string' || !/^[A-Z]+_20\d{2}$/.test(data.term) || data.timezone !== 'Asia/Ho_Chi_Minh' || !Array.isArray(data.courses) || !data.courses.length || data.courses.length > 30) throw new Error('Tệp SIS chưa đúng định dạng thời khóa biểu.');
  const group = `sis:${data.term}`;
  const items: Item[] = [];
  let cancelled = 0;
  for (const course of data.courses) {
    if (!course || typeof course !== 'object' || !Array.isArray(course.rows) || course.rows.length > 200 || !/^[A-Za-z0-9_-]{1,50}$/.test(course.code || '') || !clean(course.name, 200)) throw new Error('Tệp SIS thiếu mã hoặc tên môn học.');
    let source: URL;
    try { source = new URL(course.source); } catch { throw new Error('Tệp SIS thiếu đường dẫn nguồn.'); }
    if (source.origin !== 'https://sis.umt.edu.vn' || !/^\/attendance\/[a-f0-9-]+$/.test(source.pathname) || source.search || source.hash) throw new Error('Tệp SIS có nguồn ngoài cổng UMT.');
    for (const row of course.rows) {
      if (!row || typeof row !== 'object' || (row.cancelled !== undefined && typeof row.cancelled !== 'boolean')) throw new Error('Lịch SIS có buổi học chưa đúng định dạng.');
      if (row.cancelled === true) { cancelled++; continue; }
      const times = typeof row.time === 'string' && row.time.match(/^(\d{2}:\d{2})\s*[-–]\s*(\d{2}:\d{2})$/);
      if (!times) throw new Error('Lịch SIS thiếu khoảng giờ học.');
      const start = timestamp(row.date, times[1]); const end = timestamp(row.date, times[2]);
      if (Date.parse(end) <= Date.parse(start)) throw new Error('Lịch SIS có giờ kết thúc trước giờ bắt đầu.');
      const type = clean(row.type, 40);
      if (!type) throw new Error('Lịch SIS thiếu loại buổi học.');
      const key = `${course.code}|${start}|${end}|${type}`;
      const room = clean(row.room, 150); const building = clean(row.building, 150);
      items.push({ id: `import:${group}:${createHash('sha256').update(key).digest('hex').slice(0, 24)}`, source: 'import', kind: 'event', title: clean(course.name, 200), course: clean(course.name, 200), due: start, end, location: [room, building].filter(Boolean).join(' · '), instructor: clean(row.instructor, 200), lessonType: type, url: source.href, importGroup: group, importLabel: `SIS · ${data.term} · bản nhập ngày ${new Date().toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}` });
      if (items.length > 2000) throw new Error('Lịch SIS vượt giới hạn 2.000 buổi học.');
    }
  }
  return { items: [...new Map(items.map(item => [item.id, item])).values()], group, label: `Thời khóa biểu SIS · ${data.term}`, warnings: [`Nguồn: bảng buổi học SIS. Giờ Việt Nam (UTC+7). ${cancelled ? `Bỏ qua ${cancelled} buổi đã hủy. ` : ''}Đây là bản nhập, cần nhập lại khi SIS đổi lịch; không tự đồng bộ.`] };
}
