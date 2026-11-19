import { useEffect, useState } from 'react';
import { Bell, Volume2 } from 'lucide-react';
import type { Dashboard } from './types';

type Request = <T = any>(path: string, method?: string, body?: unknown) => Promise<T>;
export function PushSettings({ clock, request, onEnable }: { clock: Dashboard['reminderClock']; request: Request; onEnable: () => Promise<void> }) {
  const [registered, setRegistered] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [heard, setHeard] = useState(localStorage.getItem('daylight-sound-tested') === 'yes');
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const active = Boolean(clock?.lastCheck && Date.now() - Date.parse(clock.lastCheck) < 900000);
  useEffect(() => {
    if (supported) void navigator.serviceWorker.ready.then(r => r.pushManager.getSubscription()).then(value => setRegistered(Boolean(value && Notification.permission === 'granted'))).catch(() => {});
  }, [supported]);
  async function run(work: () => Promise<void>) {
    setBusy(true); setNotice('');
    try { await work(); } catch (error) { setNotice((error as Error).message); } finally { setBusy(false); }
  }
  async function test() {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription || Notification.permission !== 'granted') throw Error('Bật thông báo trên thiết bị này trước nhé.');
    await request('/push/test', 'POST', { endpoint: subscription.endpoint });
    setHeard(false); localStorage.removeItem('daylight-sound-tested');
    setNotice('Đã hẹn gửi sau khoảng 15 giây. Đóng app hoặc khóa màn hình ngay để thử tiếng chuông.');
  }
  return <div className="push-settings">
    <div className="setting-row"><div><strong>Thông báo trên điện thoại này</strong><p>{registered ? 'Đã đăng ký nhận · cần thử tiếng chuông' : 'Bật riêng trên từng iPhone hoặc Android.'}</p></div><button className="primary" disabled={busy || !supported} onClick={() => void run(async () => { await onEnable(); setRegistered(true); setNotice('Đã đăng ký. Bấm Thử tiếng chuông rồi khóa màn hình nhé.'); })}><Bell size={16}/>{registered ? 'Bật lại thông báo' : 'Cho phép thông báo'}</button></div>
    {!supported && <p className="notice">iPhone: thêm Daylight vào Màn hình chính rồi mở từ biểu tượng. Android: dùng Chrome cập nhật và bật thông báo.</p>}
    <div className="setting-row"><div><strong>Kiểm tra cả âm thanh</strong><p>{heard ? 'Bạn đã xác nhận nghe chuông trên thiết bị này.' : 'Chỉ đánh dấu thành công sau khi bạn thực sự nghe thấy.'}</p></div><button className="secondary" disabled={busy || !registered} onClick={() => void run(test)}><Volume2 size={16}/>Thử sau 15 giây</button></div>
    {notice && <p className="notice" role="status">{notice}</p>}
    {registered && !heard && <button className="text-button" onClick={() => { setHeard(true); localStorage.setItem('daylight-sound-tested', 'yes'); }}>Tôi đã thấy thông báo và nghe chuông</button>}
    <p className="privacy-note">{active ? `Nhắc nền đang liên lạc · ${new Date(clock!.lastCheck!).toLocaleString('vi-VN')}` : 'Chưa có kiểm tra nền gần đây. Mở mã cài Gmail ở Kết nối, cập nhật Code.gs rồi chạy setupDaylightReminders trong Google Apps Script.'}{clock?.failed ? ' Có lần gửi chưa thành công; hệ thống sẽ thử lại.' : ''}</p>
    <details><summary>Nếu thấy thông báo mà không nghe chuông</summary><p><b>iPhone:</b> bật thông báo cho Daylight; tắt chế độ Im lặng/Focus hoặc cho phép Daylight trong Focus, tăng âm lượng chuông. Mở app từ Màn hình chính (iOS 16.4+).</p><p><b>Android:</b> bật thông báo và âm thanh cho Daylight/Chrome trong Cài đặt điện thoại; kiểm tra Không làm phiền và hạn chế pin nếu thông báo chậm.</p><p>Daylight yêu cầu phát âm thanh, nhưng điện thoại quyết định tiếng chuông. Không ép vượt Im lặng/Focus. Nhắc nền có thể trễ do mạng, hệ điều hành hoặc giới hạn dịch vụ miễn phí.</p><p>Nhắc trước 24 giờ và 1 giờ cho mục đã có ngày/giờ. Google đánh thức mỗi phút quanh mốc đã biết; giữa các mốc, lịch mới được kiểm tra tối đa mỗi 10 phút. Giờ yên tĩnh vẫn được áp dụng.</p></details>
  </div>;
}
