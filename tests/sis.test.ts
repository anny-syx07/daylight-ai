import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSisSchedule } from '../server/sis-import.js';
import { studySummary } from '../src/studyModel.js';

const data = { schema: 'daylight.sis-schedule.v1', term: 'FALL_2026', timezone: 'Asia/Ho_Chi_Minh', courses: [{ name: 'Test course', code: '2012', source: 'https://sis.umt.edu.vn/attendance/e5e82fbf-3c9e-4b95-a2c0-ef8971aa98c9', rows: [{ date: '26/11/2026', time: '07:00 - 09:30', room: 'P.404', building: 'Tòa nhà Sáng tạo', type: 'LEC', instructor: 'Test teacher' }, { date: '08/10/2026', time: '13:50 - 16:20', room: 'P.512', building: 'Tòa nhà Sáng tạo', type: 'LAB 1.2', instructor: 'Test teacher' }] }] };

test('SIS preserves actual start/end, classroom and lesson exceptions without guessing weekly recurrences', () => {
  const result = parseSisSchedule(data);
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].due, '2026-11-26T00:00:00.000Z');
  assert.equal(result.items[0].end, '2026-11-26T02:30:00.000Z');
  assert.equal(result.items[0].location, 'P.404 · Tòa nhà Sáng tạo');
  assert.equal(result.items[0].lessonType, 'LEC');
  assert.equal(result.items[1].due, '2026-10-08T06:50:00.000Z');
  assert.equal(result.group, 'sis:FALL_2026');
  assert.ok(!JSON.stringify(result).includes('attendanceStatus'));
  const summary = studySummary(result.items, new Date('2026-11-25T00:00:00Z'));
  assert.equal(summary.work.length, 0);
  assert.equal(summary.classes.length, 1);
  const changed = structuredClone(data); changed.courses[0].rows[0].room = 'P.501';
  assert.equal(parseSisSchedule(changed).items[0].id, result.items[0].id);
});

test('SIS rejects broken dates, reversed times and unexpected source; explicit cancellations stay out of the schedule', () => {
  const invalidDate = structuredClone(data); invalidDate.courses[0].rows[0].date = '31/02/2026';
  assert.throws(() => parseSisSchedule(invalidDate), /ngày không tồn tại/);
  const invalidTime = structuredClone(data); invalidTime.courses[0].rows[0].time = '09:30 - 07:00';
  assert.throws(() => parseSisSchedule(invalidTime), /kết thúc/);
  const invalidSource = structuredClone(data); invalidSource.courses[0].source = 'https://elsewhere.example/attendance/x';
  assert.throws(() => parseSisSchedule(invalidSource), /ngoài cổng/);
  const cancel = structuredClone(data) as any; cancel.courses[0].rows[0].cancelled = true;
  const parsed = parseSisSchedule(cancel);
  assert.equal(parsed.items.length, 1);
  assert.match(parsed.warnings[0], /1 buổi đã hủy/);
});
