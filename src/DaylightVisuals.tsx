import { BookOpen, CalendarDays, Check, Cloud, Mail, Sparkles, Sun } from 'lucide-react';
import type { ReactNode } from 'react';
import './delight.css';

/** Small local illustrations: no image download or animation library needed. */
export function DaylightScene({ loading = false }: { loading?: boolean }) {
  return <div className={`daylight-scene${loading ? ' is-loading' : ''}`} aria-hidden="true">
    <span className="scene-halo"/>
    <span className="scene-rays"><Sun size={112} strokeWidth={1}/></span>
    <span className="scene-sun"><span className="scene-eyes"/><span className="scene-smile"/></span>
    <span className="scene-cloud scene-cloud-left"><Cloud size={72} strokeWidth={1.5}/></span>
    <span className="scene-cloud scene-cloud-right"><Cloud size={56} strokeWidth={1.5}/></span>
    <span className="scene-spark scene-spark-one"><Sparkles size={19}/></span>
    <span className="scene-spark scene-spark-two"><Sparkles size={12}/></span>
    <span className="scene-book"><BookOpen size={25}/><span><Check size={10}/></span></span>
  </div>;
}

export function LoadingScreen({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div className="daylight-loading" aria-busy={!onRetry}>
    <DaylightScene loading={!onRetry}/>
    <p role="status">{message}</p>
    {!onRetry && <div className="loading-steps" aria-hidden="true"><span><BookOpen size={18}/></span><i/><span><CalendarDays size={18}/></span><i/><span><Mail size={18}/></span></div>}
    {onRetry && <button className="secondary" onClick={onRetry}>Thử lại</button>}
  </div>;
}

export function BusyMark() {
  return <span className="busy-mark" aria-hidden="true"><Sun size={19}/></span>;
}

export function SectionTitle({ icon, children, tone = 'lilac' }: { icon: ReactNode; children: ReactNode; tone?: string }) {
  return <h2 className="illustrated-title"><span className={`title-symbol ${tone}`} aria-hidden="true">{icon}</span>{children}</h2>;
}
