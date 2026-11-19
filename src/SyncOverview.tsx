import { Flag, RefreshCw } from 'lucide-react';
import type { SyncHealth } from './syncHealth';

export function SyncFlag({ status, onClick }: { status: SyncHealth; onClick?: () => void }) {
  const label = <><Flag size={12}/>{status.label}</>;
  return onClick ? <button className={`sync-flag ${status.state}`} title={status.detail} onClick={onClick}>{label}</button> : <span className={`sync-flag ${status.state}`} title={status.detail}>{label}</span>;
}
export function SyncOverview({ health, enabled, busy, onToggle, onSync }: { health: SyncHealth[]; enabled: boolean; busy: boolean; onToggle: () => void; onSync: () => void }) {
  return <section className="panel sync-overview full-width" aria-label="Tình trạng tự cập nhật"><div className="section-heading"><div><h2>Tự cập nhật</h2><p>Cấp quyền một lần. Xem cờ để biết nguồn nào còn cần bạn thao tác.</p></div></div>
    <div className="sync-health-grid">{health.map(source=><article key={source.id}><div className="sync-health-heading"><h3>{source.name}</h3><SyncFlag status={source}/></div><p>{source.detail}</p>{source.lastChecked && <small>Kiểm tra: {new Date(source.lastChecked).toLocaleString('vi-VN')}</small>}{source.id==='canvas' && <div className="inline"><button className="secondary" aria-pressed={enabled} disabled={busy} onClick={onToggle}>{enabled ? 'Tắt tự cập nhật' : 'Bật tự cập nhật'}</button><button className="text-button" disabled={busy} onClick={onSync}><RefreshCw size={14}/>Đồng bộ ngay</button></div>}</article>)}</div>
  </section>;
}
