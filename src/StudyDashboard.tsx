import { ArrowUpRight, BookOpen, CalendarDays, Check, ClipboardCheck, ChartColumn, Clock, Leaf } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Item } from './types';
import { studySummary } from './studyModel';
import './study.css';
import {SectionTitle} from './DaylightVisuals';

export function StudyDashboard({ items, row, openList, openDay }: { items: Item[]; row: (item: Item) => ReactNode; openList: (kind?: string) => void; openDay: (key: string) => void }) {
  const summary = studySummary(items);
  const maximum = Math.max(1, ...summary.days.map(day => day.assignments + day.quizzes + day.classes));
  const percent = summary.work.length ? Math.round(summary.completed / summary.work.length * 100) : 0;
  const stats = [
    { label: 'Hạn hôm nay', count: summary.today, Icon: CalendarDays, tone: 'sky', action: () => openDay(summary.days[0].key) },
    { label: 'Bài tập', count: summary.assignments, Icon: BookOpen, tone: 'lilac', action: () => openList('assignment') },
    { label: 'Kiểm tra', count: summary.quizzes, Icon: ClipboardCheck, tone: 'peach', action: () => openList('quiz') },
    { label: 'Đã xong', count: summary.completed, Icon: Check, tone: 'mint', action: () => openList('completed') },
  ];
  return <div className="study-dashboard">
    <section className="study-stats" aria-label="Tổng quan học tập">{stats.map(({ label, count, Icon, tone, action }) => <button key={label} onClick={action}><span className={`stat-icon ${tone}`}><Icon size={19}/></span><span><small>{label}</small><strong>{count}</strong></span><ArrowUpRight size={16}/></button>)}</section>
    <div className="study-charts">
      <section className="panel study-chart"><div className="section-heading"><SectionTitle icon={<ChartColumn/>}>7 ngày tới</SectionTitle><span className="chart-total">{summary.days.reduce((sum, day) => sum + day.assignments + day.quizzes + day.classes, 0)} mục</span></div><div className="study-legend"><span><i className="assignment"/>Bài tập & việc</span><span><i className="quiz"/>Kiểm tra</span><span><i className="event"/>Lịch học</span></div>
        <div className="week-bars" role="group" aria-label="Khối lượng học tập trong 7 ngày">{summary.days.map(day => {
          const total = day.assignments + day.quizzes + day.classes;
          return <button key={day.key} className="week-bar-button" onClick={() => openDay(day.key)} aria-label={`${day.date.toLocaleDateString('vi-VN')}: ${day.assignments} bài tập, ${day.quizzes} kiểm tra, ${day.classes} lịch học`}><span className="bar-total">{total || '—'}</span><span className="bar-track"><span className="bar-stack" style={{ height: `${total / maximum * 100}%` }}>{day.classes > 0 && <i className="event" style={{ flex: day.classes }}/>} {day.quizzes > 0 && <i className="quiz" style={{ flex: day.quizzes }}/>} {day.assignments > 0 && <i className="assignment" style={{ flex: day.assignments }}/>}</span></span><span className="bar-day">{day.date.toLocaleDateString('vi-VN', { weekday: 'short' })}</span><strong>{day.date.getDate()}/{day.date.getMonth() + 1}</strong></button>;
        })}</div>
      </section>
      <section className="panel study-progress"><div className="section-heading"><SectionTitle tone="mint" icon={<Check/>}>Tiến độ</SectionTitle></div><div className="progress-donut" role="img" aria-label={`Đã hoàn thành ${summary.completed} trên ${summary.work.length} việc, ${percent}%`}><svg viewBox="0 0 140 140" aria-hidden="true"><circle className="donut-track" cx="70" cy="70" r="56"/><circle className="donut-value" cx="70" cy="70" r="56" pathLength="100" strokeDasharray={`${percent} 100`}/></svg><div><strong>{percent}%</strong><span>{summary.completed}/{summary.work.length} việc</span></div></div><div className="progress-numbers"><span><i/>Còn lại <b>{summary.pending.length}</b></span><span><i/>Đã xong <b>{summary.completed}</b></span></div></section>
    </div>
    <div className="study-lists"><section className="panel study-list"><div className="section-heading"><SectionTitle tone="peach" icon={<Clock/>}>Deadline gần nhất</SectionTitle><button className="text-button" onClick={() => openList()}>Tất cả <ArrowUpRight size={15}/></button></div>{summary.upcoming.length ? summary.upcoming.slice(0, 4).map(row) : <div className="study-empty"><span aria-hidden="true"><Leaf size={24}/></span>Chưa có deadline sắp tới.</div>}{summary.overdue.length > 0 && <details className="earlier-work"><summary>{summary.overdue.length} việc trước hôm nay</summary>{summary.overdue.slice(-5).map(row)}<button className="text-button" onClick={() => openList('overdue')}>Xem tất cả</button></details>}{summary.undated.length > 0 && <button className="undated-link" onClick={() => openList('undated')}>{summary.undated.length} việc chưa có hạn <ArrowUpRight size={14}/></button>}</section>
      <section className="panel study-list"><div className="section-heading"><SectionTitle tone="mint" icon={<CalendarDays/>}>Lịch học sắp tới</SectionTitle><button className="text-button" onClick={() => openDay(summary.days[0].key)}>Mở lịch <ArrowUpRight size={15}/></button></div>{summary.classes.length ? summary.classes.slice(0, 4).map(row) : <div className="study-empty"><span className="mint" aria-hidden="true"><CalendarDays size={24}/></span>Chưa có lịch học.</div>}</section></div>
  </div>;
}
