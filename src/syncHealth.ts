import type { Connection, Dashboard, ImportStatus, Item } from './types';

export type SyncSource = 'canvas' | 'gmail' | 'sis' | 'outlook' | 'files' | 'reminders' | 'news';
export interface SyncHealth { id: SyncSource; name: string; mode: 'auto' | 'conditional' | 'manual' | 'disabled'; state: 'ok' | 'pending' | 'stale' | 'blocked' | 'partial'; label: string; detail: string; lastChecked?: string; }
const recent = (stamp: string | undefined, maxAge: number, now: number) => Boolean(stamp && Number.isFinite(Date.parse(stamp)) && now - Date.parse(stamp) <= maxAge && Date.parse(stamp) <= now + 60000);
export function syncHealth(input: { canvas: Connection; imports: ImportStatus; clock: Dashboard['reminderClock']; automation?: Dashboard['automation']; remindersEnabled?: boolean; notifications?: Dashboard['notifications'] }, now = Date.now()): SyncHealth[] {
  const { canvas, imports, clock, automation } = input;
  const clockFresh = recent(clock?.lastCheck, 15 * 60000, now);
  const auto = automation?.canvas;
  let canvasStatus: SyncHealth;
  if (!canvas.connected) canvasStatus = { id:'canvas',name:'Canvas',mode:auto?.enabled ? 'auto' : 'manual',state:'blocked',label:canvas.error ? 'Cần kết nối lại' : 'Chưa kết nối',detail:canvas.error || 'Kết nối Canvas một lần để đọc dữ liệu.',lastChecked:canvas.lastSync };
  else if (auto?.enabled === false) canvasStatus = { id:'canvas',name:'Canvas',mode:'manual',state:'pending',label:'Cần bấm đồng bộ',detail:'Tự cập nhật Canvas đang tắt.',lastChecked:canvas.lastSync };
  else if (auto?.error) canvasStatus = { id:'canvas',name:'Canvas',mode:'auto',state:'stale',label:'Chưa tự cập nhật được',detail:auto.error,lastChecked:canvas.lastSync };
  else if (!clockFresh) canvasStatus = { id:'canvas',name:'Canvas',mode:'auto',state:'stale',label:'Cần kiểm tra tự động',detail:'Chưa có liên lạc nền gần đây. Cài nhắc nền trong Cài đặt; bấm Đồng bộ để lấy ngay.',lastChecked:canvas.lastSync };
  else if (!recent(canvas.lastSync, 45 * 60000, now)) canvasStatus = { id:'canvas',name:'Canvas',mode:'auto',state:'stale',label:'Đang chờ cập nhật',detail:'Lịch tự động khoảng 30 phút. Dữ liệu đang lưu có thể cũ.',lastChecked:canvas.lastSync };
  else canvasStatus = { id:'canvas',name:'Canvas',mode:'auto',state:canvas.warnings?.length ? 'partial' : 'ok',label:canvas.warnings?.length ? 'Tự động · thiếu quyền' : 'Tự động · 30 phút',detail:canvas.warnings?.length ? 'Một số quiz/tệp bị trường giới hạn. Mục đọc được vẫn tự cập nhật.' : 'Không cần bấm lại. Nút Đồng bộ dùng khi muốn lấy ngay.',lastChecked:canvas.lastSync };
  const gmail: SyncHealth = { id:'gmail',name:'Gmail / thư trường',mode:'auto',state:!imports.gmail.configured ? 'pending' : !recent(imports.gmail.lastReceived,30*60000,now) ? 'stale' : 'ok',label:!imports.gmail.configured ? 'Cần bật cầu nối' : !imports.gmail.lastReceived ? 'Chưa xác nhận tự chạy' : !recent(imports.gmail.lastReceived,30*60000,now) ? 'Cầu nối lâu chưa gửi' : 'Tự động · 10 phút',detail:'Google gửi thư gắn nhãn Daylight. Không cần mở Mac; thư chưa chuyển tiếp/gắn nhãn sẽ không được lấy.',lastChecked:imports.gmail.lastReceived };
  const sis = imports.sis;
  const sisStatus: SyncHealth = { id:'sis',name:'Lịch học SIS',mode:sis?.configured ? 'conditional' : 'manual',state:sis?.error ? 'blocked' : !sis?.configured ? 'pending' : !recent(sis.lastChecked,2*3600000,now) ? 'stale' : 'ok',label:sis?.error ? 'Cần mở SIS' : !sis?.configured ? 'Cần nhập lại / cài cầu nối' : !sis.lastChecked ? 'Chờ bật trong Chrome' : !recent(sis.lastChecked,2*3600000,now) ? 'Cần mở Chrome' : 'Tự động khi Chrome mở',detail:sis?.error || 'Khoảng mỗi giờ, cần Chrome máy tính chạy và SIS còn đăng nhập. Môn/học kỳ mới cần nhập lại.',lastChecked:sis?.lastChecked || sis?.lastImported };
  const n=input.notifications;
  const news: SyncHealth={id:'news',name:'Noti khi có tin mới',mode:n?.enabled===false?'disabled':'auto',state:n?.enabled===false || !n?.devices || !n.initialized?'pending':n.failed || n.invalidDevices?'partial':n.pending?'pending':!clockFresh?'stale':'ok',label:n?.enabled===false?'Đang tạm dừng':!n?.devices?'Cần bật trên điện thoại':!n.initialized?'Chờ kiểm tra tin mới':n.failed?'Đang thử gửi lại':n.invalidDevices?'Thiết bị cũ cần bật lại':n.pending?n.quiet?'Tin chờ hết giờ yên tĩnh':`${n.pending} tin chờ gửi`:!clockFresh?'Cần kiểm tra lịch chạy':'Tự động · tin mới',detail:'Email, thông báo, thảo luận, bài tập và quiz mới sau khi nguồn được lấy về. Gửi lỗi sẽ giữ lại để thử lại; lần đầu chỉ ghi nhận dữ liệu cũ.',lastChecked:n?.lastScan};
  return [canvasStatus,gmail,sisStatus,news,{id:'outlook',name:'Outlook trực tiếp',mode:'disabled',state:'blocked',label:'Chưa hỗ trợ',detail:'Kết nối trực tiếp đang ẩn. Thư trường đi qua Gmail.'},{id:'files',name:'Tệp .ics / .eml đã nhập',mode:'manual',state:'pending',label:'Cần nhập lại',detail:'Bản chụp đã lưu. Bấm Đồng bộ không lấy thay đổi trong tệp gốc.'},{id:'reminders',name:'Nhắc việc trên điện thoại',mode:input.remindersEnabled === false ? 'disabled' : 'auto',state:input.remindersEnabled === false ? 'pending' : !clockFresh ? 'stale' : clock?.failed ? 'partial' : 'ok',label:input.remindersEnabled === false ? 'Nhắc việc đang tắt' : !clockFresh ? 'Cần kiểm tra nhắc nền' : clock?.failed ? 'Tự động · có lần gửi lỗi' : 'Tự động · đã chạy nền',detail:'Chạy khi đóng app; mỗi điện thoại cần bật thông báo. Nhắc việc dùng dữ liệu đã lấy về, không thay cho đồng bộ nguồn.',lastChecked:clock?.lastCheck}];
}
export function itemSyncFlag(item: Item, health: SyncHealth[]) {
  if (item.source === 'canvas' && item.importLabel?.includes('Ngày hạn từ lịch .ics')) {
    const files = health.find(s => s.id === 'files');
    return files ? { ...files, label:'Hạn từ tệp · nhập lại',detail:'Ngày hạn bổ sung từ tệp .ics đã nhập. API Canvas chưa có hạn cho mục này.' } : null;
  }
  const id = item.source === 'canvas' ? 'canvas' : item.source === 'outlook' ? 'outlook' : item.importGroup === 'gmail' ? 'gmail' : item.importGroup?.startsWith('sis:') ? 'sis' : item.source === 'import' ? 'files' : null;
  if (!id) return null;
  const status = health.find(s => s.id === id);
  return status && (status.mode !== 'auto' || ['stale','blocked','pending'].includes(status.state)) ? status : null;
}
