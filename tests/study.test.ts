import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Item } from '../src/types.js';
import { studySummary, itemDayKey, dayKey } from '../src/studyModel.js';

const now = new Date(2026, 10, 19, 12);
const item = (id: string, kind: Item['kind'], day: number | null, completed = false): Item => ({ id, kind, completed, source: 'manual', title: id, course: 'Course', due: day === null ? null : new Date(2026, 10, day, 15).toISOString() });

test('study dashboard separates academic work, classes and information; totals are actual saved items', () => {
  const data = [item('assignment', 'assignment', 20), item('quiz', 'quiz', 19), item('done', 'assignment', 18, true), item('class', 'event', 20), item('mail', 'mail', null), item('undated', 'task', null), item('past', 'assignment', 17), item('file', 'file', null)];
  const result = studySummary(data, now);
  assert.equal(result.work.length, 5);
  assert.equal(result.completed, 1);
  assert.equal(result.today, 1);
  assert.equal(result.assignments, 2);
  assert.equal(result.quizzes, 1);
  assert.equal(result.classes.length, 1);
  assert.deepEqual(result.upcoming.map(value => value.id), ['quiz', 'assignment']);
  assert.deepEqual(result.overdue.map(value => value.id), ['past']);
  assert.deepEqual(result.undated.map(value => value.id), ['undated']);
  assert.equal(result.days[1].assignments, 1);
  assert.equal(result.days[1].classes, 1);
  assert.equal(result.days[0].quizzes, 1);
});

test('calendar keeps date-only events on their recorded day and seven-day charts cross month/year boundaries', () => {
  const dateOnly = { ...item('all-day', 'event', null), allDay: true, due: '2027-01-01T12:00:00.000Z' };
  assert.equal(itemDayKey(dateOnly), '2027-01-01');
  assert.equal(itemDayKey(item('undated', 'task', null)), '');
  const result = studySummary([dateOnly], new Date(2026, 11, 29, 12));
  assert.equal(result.days[0].key, '2026-12-29');
  assert.equal(result.days[6].key, '2027-01-04');
  assert.equal(result.days[3].classes, 1);
  assert.equal(dayKey(new Date(2026, 0, 2)), '2026-01-02');
  assert.equal(studySummary([], now).work.length, 0);
});
