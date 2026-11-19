import { useState } from 'react';
import { Copy, FileUp, Mail, RefreshCw, Check, X } from 'lucide-react';
import type { ImportPreview, ImportStatus } from './types';
import './imports.css';

type Requester = <T = any>(path: string, method?: string, body?: unknown) => Promise<T>;
export function ImportPanel({ status, request, onChange,canvasUrl }: { canvasUrl?:string; status: ImportStatus; request: Requester; onChange: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [setup, setSetup] = useState<{ code: string; manifest: string } | null>(null);
  async function run(work: () => Promise<void>) {
    setNotice(''); setBusy(true);
    try { await work(); await onChange(); }
    catch (error) { setNotice((error as Error).message); }
    finally { setBusy(false); }
  }
  async function readFile(file?: File) {
    setPreview(null);
    if (!file) return;
    await run(async () => {
      if (file.size > 1024 * 1024) throw new Error('Chọn tệp tối đa 1 MB nhé.');
      const content = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = () => reject(new Error('Chưa đọc được tệp. Hãy chọn lại.'));
        reader.readAsDataURL(file);
      });
      setPreview(await request<ImportPreview>('/imports/preview', 'POST', { filename: file.name, content }));
    });
  }
  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); setNotice('Đã sao chép. Dán vào Google Apps Script ở tab bên cạnh nhé.'); }
    catch { setNotice('Chưa sao chép được. Chọn nội dung trong ô rồi sao chép thủ công.'); }
  }
  return <section className="panel import-panel full-width" id="import-data">
    <div className="section-heading"><div><span className="eyebrow">THÊM MỘT LỐI VÀO NHẸ NHÀNG</span><h2>Đưa thư và lịch về Daylight</h2><p>Dùng Gmail cá nhân làm cầu nối hoặc chọn tệp bạn đã tải. {status.count} mục đang lưu.</p></div><FileUp size={24}/></div>
    <div className="import-columns">
      <div className="import-option"><span className="stat-icon lilac"><Mail size={20}/></span><h3>Thư trường → Gmail → Daylight</h3><p>Google cấp quyền đọc Gmail. Cầu nối chỉ gửi tiêu đề, người gửi và đoạn trích của thư gắn nhãn <b>Daylight</b> trong 30 ngày qua; không gửi tệp đính kèm.</p>
        <div className="notice">{status.gmail.lastReceived ? <>Cầu nối liên lạc gần nhất: {new Date(status.gmail.lastReceived).toLocaleString('vi-VN')}<br/>{status.gmail.receivedCount ? `Đã lưu ${status.gmail.receivedCount} email từ Gmail.` : 'Chưa nhận email. Gắn nhãn Daylight cho một thư rồi chạy syncDaylight.'}</> : status.gmail.configured ? 'Đã tạo cấu hình. Chưa nhận liên lạc từ Gmail — cần hoàn tất bước cấp quyền bên Google.' : 'Chưa thiết lập cầu nối Gmail.'}</div>
        <div className="inline"><button className="primary" disabled={busy} onClick={() => run(async () => { setSetup(await request('/imports/gmail/setup', 'POST')); })}>{busy ? <RefreshCw size={16} className="spin"/> : <Mail size={16}/>} {status.gmail.configured ? 'Mở mã cài Gmail' : 'Tạo cầu nối Gmail'}</button><a className="text-button" href="/huong-dan#gmail" target="_blank" rel="noopener noreferrer">Hướng dẫn từng bước ↗</a></div>
        {setup && <div className="gmail-setup"><p>Giữ riêng hai đoạn này. Mã đã có địa chỉ Daylight và khóa nhận thư của bạn.</p><label>Code.gs<textarea readOnly rows={5} value={setup.code} spellCheck={false}/></label><button className="secondary" onClick={() => copy(setup.code)}><Copy size={15}/>Sao chép Code.gs</button><label>appsscript.json<textarea readOnly rows={4} value={setup.manifest} spellCheck={false}/></label><button className="secondary" onClick={() => copy(setup.manifest)}><Copy size={15}/>Sao chép appsscript.json</button><a className="secondary" href="https://script.google.com/home/start" target="_blank" rel="noopener noreferrer">Mở Google Apps Script ↗</a><button className="text-button" onClick={() => setSetup(null)}>Ẩn mã cài đặt</button></div>}
        {status.gmail.configured && <button className="text-button muted" disabled={busy} onClick={() => run(async () => { await request('/imports/gmail/setup', 'DELETE'); setSetup(null); setNotice('Đã thu hồi khóa nhận thư. Email đã nhập vẫn được giữ. Chạy stopDaylight trong Apps Script để dừng lịch kiểm tra bên Google.'); })}>Ngắt cầu nối Gmail</button>}
      </div>
      <div className="import-option"><span className="stat-icon lilac"><FileUp size={20}/></span><h3>Lịch Canvas hoặc email tải về</h3><p><b>.ics</b>: bài tập và sự kiện vào Lịch học / Việc cần làm.<br/><b>.eml</b>: email vào Hộp học tập. Chưa tự suy đoán deadline từ nội dung thư.</p>
        <div className="inline"><a className="secondary" href={canvasUrl?`${canvasUrl}/calendar`:'/huong-dan#canvas'} target="_blank" rel="noopener noreferrer">Mở lịch Canvas ↗</a><a className="text-button" href="/huong-dan#nhap-tep" target="_blank" rel="noopener noreferrer">Cách tải tệp ↗</a></div>
        <label className="import-file">Chọn tệp .ics, .eml hoặc .sis.json · tối đa 1 MB<input type="file" accept=".ics,.eml,.json" disabled={busy} onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; void readFile(file); }}/></label>
        <p className="privacy-note">Đây là bản nhập thủ công; bấm Đồng bộ không cập nhật tệp. Nhập lại lịch cùng tên tệp để thay bản cũ và nhận thay đổi.</p>
        {preview && <div className="import-preview"><h4>Xem trước: {preview.label}</h4><p>{preview.items.length} mục trong khoảng hỗ trợ. Chưa lưu vào góc học tập.</p><ul>{preview.items.slice(0, 5).map(item => <li key={item.id}><strong>{item.title}</strong><br/>{item.due ? item.allDay ? `${item.due.slice(0, 10)} · cả ngày` : new Date(item.due).toLocaleString('vi-VN') : 'Email · chưa có deadline'}</li>)}</ul>{preview.items.length > 5 && <p>Và {preview.items.length - 5} mục khác.</p>}{preview.warnings.map(warning => <p className="privacy-note" key={warning}>{warning}</p>)}<div className="inline"><button disabled={busy} className="primary" onClick={() => run(async () => { const result = await request('/imports/confirm', 'POST', { id: preview.id }); setPreview(null); setNotice(`Đã lưu ${result.count} mục. Mở Lịch học hoặc Hộp học tập để xem nhé.`); })}><Check size={16}/>{preview.items.length ? 'Lưu vào Daylight' : 'Thay bản lịch cũ bằng lịch trống'}</button><button className="secondary" disabled={busy} onClick={() => setPreview(null)}><X size={16}/>Hủy</button></div></div>}
      </div>
    </div>
    {notice && <div className="notice" role="status">{notice}</div>}
  </section>;
}
