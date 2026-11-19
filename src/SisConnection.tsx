import { useState } from 'react';
import { Clock, Download } from 'lucide-react';
import type { SisStatus } from './types';

export function SisConnection({ status, onChange }: { status?: SisStatus; onChange: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const stale = !status?.lastChecked || Date.now() - Date.parse(status.lastChecked) > 2 * 3600000;
  async function download() {
    setBusy(true); setNotice('');
    try {
      const response = await fetch('/api/imports/sis/setup', { method: 'POST' });
      if (!response.ok) throw new Error((await response.json()).error || 'Chưa tải được cầu nối.');
      const url = URL.createObjectURL(await response.blob());
      const a = document.createElement('a'); a.href = url; a.download = 'Daylight-SIS.zip'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      setNotice('Đã tải. Giải nén rồi cài theo 3 bước bên dưới.'); await onChange();
    } catch (error) { setNotice((error as Error).message); }
    finally { setBusy(false); }
  }
  async function revoke() {
    setBusy(true);
    try { const r = await fetch('/api/imports/sis/setup', { method: 'DELETE' }); if (!r.ok) throw Error('Chưa ngắt được cầu nối.'); setNotice('Đã thu hồi khóa. Lịch đã nhập vẫn được giữ.'); await onChange(); }
    catch (error) { setNotice((error as Error).message); }
    finally { setBusy(false); }
  }
  return <section className="panel integration"><div className="section-heading"><span className="source-logo big outlook">S</span><span className="badge">{status?.lastChecked && !stale && !status.error ? 'Đã kiểm tra' : status?.configured ? 'Cần kiểm tra' : status?.count ? 'Bản nhập' : 'Chưa nhập'}</span></div><h2>SIS UMT</h2><p>{status?.count || 0} buổi học · giờ và phòng</p>
    <div className="sync-status"><Clock size={15}/>{status?.lastChecked ? `Kiểm tra: ${new Date(status.lastChecked).toLocaleString('vi-VN')}` : status?.lastImported ? `Nhập: ${new Date(status.lastImported).toLocaleString('vi-VN')}` : 'Chưa có lịch'}</div>
    {status?.error ? <p className="notice">{status.error}</p> : status?.configured && stale ? <p className="notice">Chưa kiểm tra gần đây. Mở cầu nối trong Chrome.</p> : status?.lastChecked ? <p className="privacy-note">{status.changed ? `${status.changed} mục thay đổi ở lần kiểm tra gần nhất.` : 'Lịch không đổi ở lần kiểm tra gần nhất.'}</p> : <p className="privacy-note">Chưa tự cập nhật khi SIS đổi lịch.</p>}
    <div className="inline"><button className="primary" disabled={busy || !status?.count} onClick={() => void download()}><Download size={16}/>{status?.configured ? 'Tải lại bộ cài' : 'Tải cầu nối Chrome'}</button><a className="text-button" href="https://sis.umt.edu.vn/my-schedule" target="_blank" rel="noopener noreferrer">Mở SIS ↗</a></div>
    <details><summary>Cài cầu nối Chrome</summary><ol><li>Tải và giải nén <b>Daylight-SIS.zip</b>.</li><li>Trong Chrome mở <b>chrome://extensions</b> → bật <b>Developer mode</b> → <b>Load unpacked</b> → chọn thư mục vừa giải nén.</li><li>Đăng nhập SIS trong cùng hồ sơ Chrome. Mở tiện ích <b>Daylight · SIS UMT</b> → <b>Bật cập nhật</b>.</li></ol><p className="privacy-note">Kiểm tra khoảng mỗi giờ khi Chrome chạy, máy thức và SIS còn đăng nhập. Cập nhật các môn trong học kỳ đã nhập; môn mới/học kỳ mới cần nhập lại. Chỉ gửi ngày, giờ, phòng, loại buổi và giảng viên về Daylight. Không đọc mật khẩu, cookie hay điểm danh. Giữ riêng tệp tải về vì có khóa ghi lịch; khi lỗi sẽ giữ lịch cũ.</p></details>
    {status?.configured && <button className="text-button muted" disabled={busy} onClick={() => void revoke()}>Ngắt cầu nối SIS</button>}{notice && <p className="notice" role="status">{notice}</p>}
  </section>;
}
