import { useEffect, useState, type ReactNode } from 'react';
import { BookOpen, Check, Copy, ExternalLink, Link2, Sun } from 'lucide-react';
import './connection-help.css';

export const connectionLinks = {
  canvas: 'https://umthcm.instructure.com/profile/settings',
  microsoft: 'https://entra.microsoft.com/',
  environment: 'https://vercel.com/annys-projects-6f31807a/daylight-ai/settings/environment-variables',
  deployments: 'https://vercel.com/annys-projects-6f31807a/daylight-ai/deployments',
};

function NewTabLink({ href, children }: { href: string; children: ReactNode }) {
  return <a className="secondary guide-link" href={href} target="_blank" rel="noopener noreferrer">{children}<ExternalLink size={15}/><span className="sr-only"> (mở tab mới)</span></a>;
}

function CopyField({ label, value, multiline = false }: { label: string; value: string; multiline?: boolean }) {
  const [status, setStatus] = useState('');
  async function copy() {
    try { await navigator.clipboard.writeText(value); setStatus('Đã sao chép'); }
    catch { setStatus('Chưa sao chép được. Chọn nội dung trong ô rồi sao chép thủ công nhé.'); }
  }
  return <div className="guide-copy-field">
    <label>{label}{multiline ? <textarea value={value} readOnly rows={7} onFocus={event => event.currentTarget.select()}/> : <input value={value} readOnly onFocus={event => event.currentTarget.select()}/>}</label>
    <button className="secondary" type="button" onClick={copy}>{status === 'Đã sao chép' ? <Check size={15}/> : <Copy size={15}/>}Sao chép {multiline ? 'nội dung' : 'địa chỉ'}</button>
    <span className="guide-copy-status" role="status">{status}</span>
  </div>;
}

export function CanvasHelp({ compact = false }: { compact?: boolean }) {
  return <div className={`connection-steps ${compact ? 'compact' : ''}`}>
    <p className="guide-intro">Mở Canvas ở tab bên cạnh. Xong mỗi bước, bạn có thể quay lại Daylight bất cứ lúc nào.</p>
    <NewTabLink href={connectionLinks.canvas}>Mở trang cài đặt Canvas</NewTabLink>
    <ol>
      <li><strong>Đăng nhập Canvas của trường.</strong><p>Nếu chưa đến đúng trang, chọn ảnh đại diện / <b>Account (Tài khoản)</b> ở thanh bên → <b>Settings (Cài đặt)</b>.</p></li>
      <li><strong>Tạo quyền truy cập cho Daylight.</strong><p>Cuộn đến <b>Approved Integrations</b> → <b>+ New Access Token</b>. Ô <b>Purpose</b> điền <b>Daylight AI</b>; chọn ngày hết hạn phù hợp rồi bấm <b>Generate Token</b>.</p></li>
      <li><strong>Quay lại Daylight để kết nối.</strong><p>Sao chép token vừa hiện. Trong Daylight, chọn <b>Kết nối → Canvas LMS → Kết nối</b>, dán vào ô <b>Access token</b> rồi bấm <b>Kết nối bảo mật</b>.</p></li>
      {!compact && <li><strong>Chờ dữ liệu của bạn xuất hiện.</strong><p>Daylight kiểm tra tài khoản rồi đồng bộ. Khi thấy <b>Đã xác thực</b> và thời gian đồng bộ, vào <b>Việc cần làm</b> hoặc <b>Hộp học tập</b>. Nếu có cảnh báo, mở mục đó để biết môn / loại dữ liệu nào chưa được cấp quyền.</p></li>}
    </ol>
    <details className="guide-troubleshoot"><summary>Không thấy nút New Access Token?</summary><p>Trường có thể giới hạn quyền tạo token. Nhờ bộ phận hỗ trợ Canvas của trường cấp cách kết nối phù hợp cho tài khoản của bạn.</p></details>
    {!compact && <p className="guide-source"><a href="https://community.instructure.com/en/instructure/kb/articles/662901-how-do-i-manage-api-access-tokens-in-my-user-account" target="_blank" rel="noopener noreferrer">Xem hướng dẫn Canvas chính thức <ExternalLink size={12}/></a></p>}
  </div>;
}

export function OutlookHelp() {
  const callback = `${window.location.origin}/api/oauth/microsoft`;
  const adminRequest = `Chào bộ phận IT, em muốn kết nối ứng dụng học tập cá nhân Daylight AI với Microsoft 365 của trường. Nhờ anh/chị hỗ trợ đăng ký hoặc phê duyệt ứng dụng trong tenant trường: loại Web, single tenant; Redirect URI: ${callback}; Microsoft Graph delegated permissions: User.Read, Mail.Read, Calendars.Read. Ứng dụng chỉ đọc email và lịch của tài khoản đăng nhập. Nếu chính sách trường không cho phép, nhờ anh/chị hướng dẫn phương án phù hợp. Em cảm ơn.`;
  return <div className="connection-steps">
    <p className="guide-intro">Cài đặt Microsoft một lần cho Daylight. Những lần sau bạn chỉ cần bấm Kết nối Outlook và đăng nhập.</p>
    <div className="guide-callout"><strong>Bạn đang dùng tài khoản trường?</strong><p>Nếu Microsoft báo thiếu quyền ngay từ bước đầu, mở mục “Nhờ IT hỗ trợ” bên dưới; bạn có sẵn nội dung để sao chép.</p></div>
    <NewTabLink href={connectionLinks.microsoft}>Mở Microsoft Entra</NewTabLink>
    <ol>
      <li><strong>Đăng ký ứng dụng Daylight AI.</strong><p>Đăng nhập tài khoản Microsoft 365 của trường. Vào <b>Entra ID → App registrations → New registration</b>. Đặt tên <b>Daylight AI</b>; chọn <b>Accounts in this organizational directory only (Single tenant)</b>, rồi bấm <b>Register</b>.</p><p>Nếu có nhiều directory, chọn directory của trường ở góc tài khoản trước khi tạo.</p></li>
      <li><strong>Cho Microsoft biết nơi quay về Daylight.</strong><p>Trong ứng dụng vừa tạo, mở <b>Authentication → Add a platform → Web</b>. Dán địa chỉ bên dưới vào <b>Redirect URIs</b>, rồi bấm <b>Configure / Save</b>.</p><CopyField label="Redirect URI · sao chép nguyên địa chỉ này" value={callback}/></li>
      <li><strong>Cấp quyền đọc email và lịch.</strong><p>Vào <b>API permissions → Add a permission → Microsoft Graph → Delegated permissions</b>. Tìm và thêm đủ ba quyền sau:</p><ul className="guide-scopes"><li><code>User.Read</code> — đọc hồ sơ đăng nhập</li><li><code>Mail.Read</code> — đọc email</li><li><code>Calendars.Read</code> — đọc lịch</li></ul><p>Bấm <b>Add permissions</b>. Nếu thấy <b>Need admin approval</b>, cần quản trị viên trường phê duyệt.</p></li>
      <li><strong>Lấy ba thông tin cấu hình.</strong><p>Trong <b>Overview</b>, giữ lại <b>Application (client) ID</b> và <b>Directory (tenant) ID</b>.</p><p>Tiếp theo vào <b>Certificates & secrets → Client secrets → New client secret</b>. Đặt mô tả <b>Daylight AI</b>, chọn hạn dùng, bấm <b>Add</b>. Sao chép cột <b>Value</b> của secret vừa tạo — cột <b>Secret ID</b> là một thông tin khác. Microsoft chỉ hiển thị Value lúc tạo.</p></li>
      <li><strong>Điền cấu hình vào nơi lưu bảo mật của app.</strong><NewTabLink href={connectionLinks.environment}>Mở cấu hình Daylight trên Vercel</NewTabLink><p>Bấm <b>Add Environment Variable</b> để thêm từng dòng dưới đây, chọn môi trường <b>Production</b>, rồi <b>Save</b>:</p><dl className="guide-mapping"><div><dt><code>MS_CLIENT_ID</code></dt><dd>Application (client) ID từ Overview</dd></div><div><dt><code>MS_TENANT_ID</code></dt><dd>Directory (tenant) ID từ Overview</dd></div><div><dt><code>MS_CLIENT_SECRET</code></dt><dd>Value của client secret vừa tạo; lưu dưới loại Secret / Sensitive nếu giao diện có tùy chọn</dd></div></dl><p>Nếu dòng đã có sẵn, mở dòng đó để sửa giá trị. Chỉ chỉnh ba mục trên, giữ nguyên cấu hình còn lại.</p></li>
      <li><strong>Áp dụng thay đổi và đăng nhập Outlook.</strong><NewTabLink href={connectionLinks.deployments}>Mở trang triển khai Daylight</NewTabLink><p>Chọn bản <b>Production</b> gần nhất → menu <b>⋯ → Redeploy → Redeploy</b>. Chờ trạng thái <b>Ready</b>.</p><p>Quay lại Daylight, tải lại trang → <b>Kết nối → Microsoft Outlook → Kết nối</b>. Chọn tài khoản trường trên trang Microsoft và chấp thuận quyền đọc. Khi thành công, Daylight hiện <b>Đã xác thực</b> cùng thời gian đồng bộ.</p></li>
    </ol>
    <details className="guide-troubleshoot"><summary>Nhờ IT hỗ trợ khi không có quyền / Need admin approval</summary><p>Bạn có thể gửi nội dung dưới đây cho bộ phận IT của trường. Việc sao chép không tự gửi tin nhắn.</p><CopyField label="Nội dung nhờ IT hỗ trợ" value={adminRequest} multiline/></details>
    <p className="guide-source"><a href="https://learn.microsoft.com/en-us/graph/auth-register-app-v2" target="_blank" rel="noopener noreferrer">Xem hướng dẫn Microsoft chính thức <ExternalLink size={12}/></a></p>
  </div>;
}

export function ConnectionHelpPage() {
  useEffect(() => {
    const section = window.location.hash.slice(1);
    if (section === 'canvas' || section === 'outlook') document.getElementById(section)?.scrollIntoView();
  }, []);
  return <main className="connection-help-page">
    <header className="guide-page-header"><a className="brand" href="/"><img src="/icon.svg" alt=""/>daylight.</a><a className="secondary" href="/?page=connections"><Link2 size={16}/>Về mục Kết nối</a></header>
    <div className="guide-page-heading"><span className="eyebrow"><Sun size={15}/> MỞ TAB BÊN CẠNH, LÀM TỪNG BƯỚC THÔI</span><h1>Kết nối việc học,<br/><span>nhẹ nhàng từng chút.</span></h1><p>Các nút mở trang bên ngoài ở tab mới, để hướng dẫn này luôn ở đây cùng bạn.</p></div>
    <nav className="guide-jump" aria-label="Chọn hướng dẫn"><a href="#canvas"><BookOpen size={17}/>Canvas LMS · bắt đầu ở đây</a><a href="#outlook"><Link2 size={17}/>Outlook · cài đặt một lần</a></nav>
    <section id="canvas" className="panel guide-section"><div className="guide-section-title"><span className="source-logo big canvas">C</span><div><p className="eyebrow">BÀI TẬP, QUIZ, TÀI LIỆU VÀ LỊCH</p><h2>Kết nối Canvas của trường</h2></div></div><CanvasHelp/><a className="primary" href="/?page=connections">Tôi đã có token · về Daylight</a></section>
    <section id="outlook" className="panel guide-section"><div className="guide-section-title"><span className="source-logo big outlook">O</span><div><p className="eyebrow">EMAIL VÀ LỊCH MICROSOFT 365</p><h2>Kết nối Outlook của trường</h2></div></div><OutlookHelp/><a className="primary" href="/?page=connections">Đã cài đặt xong · về Daylight</a></section>
    <footer className="guide-page-footer">Từng chút một, cũng là tiến lên. ☀️</footer>
  </main>;
}
