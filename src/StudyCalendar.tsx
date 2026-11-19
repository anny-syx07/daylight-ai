import { useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import type { Item } from './types';
import { chronological, dateFromKey, dayKey, isDeadline, itemDayKey, shortTime } from './studyModel';
import './study.css';

export function StudyCalendar({ items, initialDay, row, onAdd }: { items: Item[]; initialDay: string; row: (item: Item) => ReactNode; onAdd: () => void }) {
  const selectedDate = dateFromKey(initialDay);
  const [selected, setSelected] = useState(initialDay);
  const [month, setMonth] = useState(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
  const [filter, setFilter] = useState('all');
  const [course, setCourse] = useState('all');
  const [query, setQuery] = useState('');
  const [view, setView] = useState('month');
  const today = dayKey(new Date());
  const dated = items.filter(item => item.due && (isDeadline(item) || item.kind === 'event'));
  const courses = [...new Set(dated.map(item => item.course))].sort();
  const visible = dated.filter(item => (filter === 'all' || (filter === 'classes' ? item.kind === 'event' : isDeadline(item))) && (course === 'all' || item.course === course) && `${item.title} ${item.course}`.toLocaleLowerCase('vi').includes(query.toLocaleLowerCase('vi'))).sort(chronological);
  const byDay = new Map<string, Item[]>();
  for (const item of visible) { const key = itemDayKey(item); byDay.set(key, [...byDay.get(key) || [], item]); }
  const selectedItems = byDay.get(selected) || [];
  const startOffset = (month.getDay() + 6) % 7;
  const dayCount = Math.ceil((startOffset + new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()) / 7) * 7;
  const monthEntries = visible.filter(item => { const date = dateFromKey(itemDayKey(item)); return date.getMonth() === month.getMonth() && date.getFullYear() === month.getFullYear(); });
  function moveMonth(offset: number) { const next = new Date(month.getFullYear(), month.getMonth() + offset, 1); setMonth(next); setSelected(dayKey(next)); }
  function agenda(entries: Item[]) { return <>{(['deadlines', 'classes'] as const).map(group => { const values = entries.filter(item => group === 'classes' ? item.kind === 'event' : isDeadline(item)); return values.length ? <div className={`agenda-group ${group}`} key={group}><h3><i/>{group === 'classes' ? 'Lịch học' : 'Deadline'}<span>{values.length}</span></h3>{values.map(row)}</div> : null; })}</>; }
  return <section className="study-calendar">
    <div className="calendar-tools"><div className="segmented" aria-label="Lọc lịch">{[['all', 'Tất cả'], ['deadlines', 'Deadline'], ['classes', 'Lịch học']].map(([id, label]) => <button key={id} aria-pressed={filter === id} className={filter === id ? 'active' : ''} onClick={() => setFilter(id)}>{label}</button>)}</div><div className="calendar-search"><Search size={16}/><input aria-label="Tìm trong lịch" value={query} placeholder="Tìm lịch…" onChange={event => setQuery(event.target.value)}/></div><select aria-label="Lọc môn trong lịch" value={course} onChange={event => setCourse(event.target.value)}><option value="all">Tất cả môn</option>{courses.map(value => <option key={value}>{value}</option>)}</select></div>
    <div className="study-calendar-layout"><div className="panel month-panel"><div className="month-heading"><div className="inline"><button className="icon-button" aria-label="Tháng trước" onClick={() => moveMonth(-1)}><ChevronLeft size={19}/></button><h2>{month.toLocaleString('vi-VN', { month: 'long', year: 'numeric' })}</h2><button className="icon-button" aria-label="Tháng sau" onClick={() => moveMonth(1)}><ChevronRight size={19}/></button></div><div className="inline"><button className="secondary" onClick={() => { setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1)); setSelected(today); }}>Hôm nay</button><div className="segmented calendar-view" aria-label="Kiểu xem lịch"><button className={view === 'month' ? 'active' : ''} aria-pressed={view === 'month'} onClick={() => setView('month')}>Tháng</button><button className={view === 'list' ? 'active' : ''} aria-pressed={view === 'list'} onClick={() => setView('list')}>Danh sách</button></div></div></div>
      <div className="study-legend"><span><i className="assignment"/>Deadline</span><span><i className="quiz"/>Kiểm tra</span><span><i className="event"/>Lịch học</span></div>
      {view === 'month' ? <div className="study-month-grid">{['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map(value => <span className="weekday-label" key={value}>{value}</span>)}{Array.from({ length: dayCount }, (_, index) => {
        const date = new Date(month.getFullYear(), month.getMonth(), index - startOffset + 1); const key = dayKey(date); const entries = byDay.get(key) || [];
        return <button key={key} className={`study-day ${date.getMonth() !== month.getMonth() ? 'outside' : ''} ${key === selected ? 'selected' : ''}`} aria-label={`${date.toLocaleDateString('vi-VN')}: ${entries.length} mục`} aria-pressed={key === selected} onClick={() => setSelected(key)}><span className={`date-number ${key === today ? 'is-today' : ''}`}>{date.getDate()}</span><div className="day-entry-list">{entries.slice(0, 2).map(item => <span key={item.id} className={`day-entry ${item.completed ? 'done' : ''} ${item.kind === 'event' ? 'event' : item.kind === 'quiz' ? 'quiz' : 'assignment'}`}><b>{shortTime(item)}</b>{item.title}</span>)}{entries.length > 2 && <small>+{entries.length - 2}</small>}</div><div className="compact-day-counts">{entries.some(isDeadline) && <span className="deadline-dot">{entries.filter(isDeadline).length}</span>}{entries.some(item => item.kind === 'event') && <span className="class-dot">{entries.filter(item => item.kind === 'event').length}</span>}</div></button>;
      })}</div> : <div className="month-list">{monthEntries.length ? [...new Set(monthEntries.map(itemDayKey))].map(key => <section key={key}><button className="list-date" onClick={() => setSelected(key)}>{dateFromKey(key).toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' })}</button>{agenda(byDay.get(key) || [])}</section>) : <div className="study-empty">Không có lịch trong tháng này.</div>}</div>}
    </div><aside className="panel study-agenda"><div className="section-heading"><h2>{dateFromKey(selected).toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit' })}</h2><span className="chart-total">{selectedItems.length}</span></div>{selectedItems.length ? agenda(selectedItems) : <div className="study-empty">Ngày này chưa có lịch.<button className="text-button" onClick={onAdd}>+ Thêm lịch</button></div>}</aside></div>
  </section>;
}
