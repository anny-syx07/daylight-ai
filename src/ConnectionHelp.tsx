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
    <details className="guide-troubleshoot"><summary>Token vừa tạo nhưng Canvas chưa chấp nhận?</summary><p>Mã HTTP 401 chỉ cho biết Canvas chưa xác thực yêu cầu; riêng mã đó chưa đủ để kết luận token hết hạn.</p><p>Mở trang cài đặt Canvas bằng nút ở trên và kiểm tra địa chỉ là <b>umthcm.instructure.com</b>. Sao chép đầy đủ giá trị <b>Token</b>, rồi dán lại trong ô Access token của Daylight. Nếu bạn đã chọn ngày hết hạn, đối chiếu ngày đó trong Canvas.</p><p>Nếu app báo thiếu quyền (HTTP 403 / insufficient scope), nhờ hỗ trợ Canvas của trường kiểm tra quyền API. Đăng nhập được trên trang Canvas chưa đồng nghĩa với quyền API đã được cấp.</p></details>
    <details className="guide-troubleshoot"><summary>Đã xác thực nhưng một số Tài liệu / Quiz báo 403 hoặc 404?</summary><p>Kết nối tài khoản đã thành công. HTTP 403 ở Tài liệu là chưa có quyền liệt kê thư mục của môn đó; Daylight thử lấy liên kết từ các mô-đun Canvas cho phép đọc, không tải nội dung tệp. Khi mở liên kết, Canvas vẫn kiểm tra quyền của bạn.</p><p>HTTP 404 ở API Quiz không đủ để kết luận môn không có quiz. Daylight vẫn giữ các quiz lấy được qua danh sách bài tập; chưa bảo đảm đã đủ tất cả. Các bài tập và mục khác tải thành công vẫn sử dụng bình thường. Bấm <b>Đồng bộ</b> để kiểm tra lại.</p></details>
    {!compact && <p className="guide-source"><a href="https://community.instructure.com/en/instructure/kb/articles/662901-how-do-i-manage-api-access-tokens-in-my-user-account" target="_blank" rel="noopener noreferrer">Xem hướng dẫn Canvas chính thức <ExternalLink size={12}/></a></p>}
  </div>;
}

export function OutlookHelp() {
  const callback = `${window.location.origin}/api/oauth/microsoft`;
  const adminRequest = `Chào bộ phận IT, em muốn kết nối ứng dụng học tập cá nhân Daylight AI với Microsoft 365 của trường. Nhờ anh/chị hỗ trợ đăng ký hoặc phê duyệt ứng dụng trong tenant trường: loại Web, single tenant; Redirect URI: ${callback}; Microsoft Graph delegated permissions: User.Read, Mail.Read, Calendars.Read. Ứng dụng chỉ đọc email và lịch của tài khoản đăng nhập. Nếu chính sách trường không cho phép, nhờ anh/chị hướng dẫn phương án phù hợp. Em cảm ơn.`;
  return <div className="connection-steps">
    <div className="guide-callout"><strong>Muốn dùng ngay qua Gmail cá nhân?</strong><p>Bạn có thể thử chuyển tiếp thư sang Gmail và dùng cầu nối bên dưới. Không cần đăng ký ứng dụng trong Entra cho cách này. <a href="#gmail">Xem hướng dẫn Gmail ↓</a></p></div>
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

export function GmailHelp() {
  return <div className="connection-steps">
    <p>Luồng dữ liệu: <b>thư Outlook / thông báo Canvas → Gmail cá nhân → nhãn Daylight → Daylight</b>. Bạn tự cấp quyền trên Google; không cần tạo ứng dụng Microsoft cho luồng này.</p>
    <ol>
      <li><strong>Đưa thư học tập về Gmail cá nhân.</strong><NewTabLink href="https://outlook.cloud.microsoft/mail/options/mail/forwarding">Mở chuyển tiếp Outlook</NewTabLink><p>Bật <b>Chuyển tiếp</b> → điền Gmail của bạn → tích <b>Lưu một bản sao của thư được chuyển tiếp</b> → <b>Lưu</b>. Chỉ hoàn tất khi bạn muốn sao chép thư trường sang Gmail. Gửi một thư thử tới email trường và kiểm tra Gmail đã nhận được chưa. Thiết lập này áp dụng thư mới; không kéo thư cũ.</p><p>Nếu thư không tới hoặc có lỗi <b>5.7.520</b>, trường có thể chặn chuyển tiếp ra ngoài. Bạn vẫn có thể chọn vài thư rồi bấm Forward thủ công nếu được phép.</p></li>
      <li><strong>Cho Canvas gửi thông báo thẳng tới Gmail.</strong><NewTabLink href={connectionLinks.canvas}>Mở cài đặt Canvas</NewTabLink><p>Trong <b>Ways to Contact / Email Addresses</b> → <b>+ Email Address</b> → thêm Gmail → mở thư xác minh trong Gmail. Sau đó vào <b>Account → Notifications</b>, bật loại thông báo bạn cần ở cột Gmail, chọn gửi ngay nếu có. Cách này lấy thông báo mới; không lấy toàn bộ kho điểm hoặc tệp Canvas.</p></li>
      <li><strong>Chọn email Daylight được nhận.</strong><NewTabLink href="https://mail.google.com/">Mở Gmail</NewTabLink><p>Tạo nhãn tên chính xác <b>Daylight</b>. Gắn nhãn đó cho một thư học tập để thử. Muốn tự động về sau: mở một thư mẫu → <b>⋮ → Lọc thư giống thư này → Tạo bộ lọc → Áp dụng nhãn Daylight</b>. Kiểm tra điều kiện lọc chỉ khớp thư bạn muốn đưa vào app.</p></li>
      <li><strong>Lấy mã cầu nối riêng trong Daylight.</strong><p>Về <b>Kết nối → Đưa thư và lịch về Daylight → Tạo cầu nối Gmail</b>. Giữ tab này mở; bạn sẽ sao chép hai phần <b>Code.gs</b> và <b>appsscript.json</b>.</p><NewTabLink href="/?page=connections">Mở mục Kết nối Daylight</NewTabLink></li>
      <li><strong>Tạo Google Apps Script bằng Gmail cá nhân.</strong><NewTabLink href="https://script.google.com/home/start">Mở Google Apps Script</NewTabLink><p>Bấm <b>Dự án mới / New project</b>, đặt tên <b>Daylight Gmail Bridge</b>. Trong <b>Code.gs</b>, xóa mã mẫu và dán phần Code.gs vừa sao chép từ app.</p><p>Bấm biểu tượng bánh răng <b>Project Settings</b> → bật <b>Show appsscript.json manifest file in editor</b>. Về trình soạn thảo <b>Editor</b> → mở <b>appsscript.json</b> → thay toàn bộ bằng phần appsscript.json từ Daylight. Bấm <b>Lưu</b>. Tệp này bật Gmail API và khai báo quyền chỉ đọc Gmail.</p></li>
      <li><strong>Chạy một lần và tự cấp quyền Google.</strong><p>Ở thanh trên, chọn hàm <b>setupDaylight</b> → <b>Run / Chạy</b> → <b>Review permissions</b> → chọn Gmail cá nhân → xem và chấp thuận quyền đọc Gmail, gửi yêu cầu tới Daylight và chạy theo lịch nếu bạn đồng ý. Nếu Google hiện cảnh báo ứng dụng chưa xác minh, chỉ tiếp tục khi đó đúng là dự án bạn vừa tạo và đã xem mã. Nếu Google chặn, dừng ở đó; vẫn có cách nhập tệp bên dưới.</p><p>Không cần bấm Deploy. Hàm này gửi thử rồi tạo lịch kiểm tra khoảng <b>10 phút/lần</b>. Google có giới hạn và có thể chạy trễ. Mỗi lượt gửi tối đa 100 thư chưa gửi trong 30 ngày qua, quét tối đa 1.000 thư gần nhất mang nhãn.</p></li>
      <li><strong>Kiểm tra thư thật trong app.</strong><p>Quay lại Daylight → <b>Kết nối</b> để xem thời gian liên lạc và số email đã lưu → <b>Hộp học tập</b>. Bấm dấu <b>+</b> cạnh email để tạo việc và chọn deadline. Lịch iCal bên dưới sẽ giúp lấy ngày hạn chính xác hơn từ Canvas.</p><p>Muốn dừng: chọn hàm <b>stopDaylight</b> rồi Chạy trong Apps Script; trong Daylight bấm <b>Ngắt cầu nối Gmail</b> để thu hồi khóa nhận. Email đã nhập vẫn được giữ và có thể xóa từng mục trong Hộp học tập.</p></li>
    </ol>
    <div className="guide-callout"><strong>Google cấp quyền đọc Gmail của tài khoản.</strong><p>Đoạn mã chỉ chọn thư mang nhãn Daylight và gửi tiêu đề, người gửi, đoạn trích. Không gửi mật khẩu Google, toàn bộ nội dung thư hay tệp đính kèm. Nhãn giới hạn hành vi của mã, không thu hẹp phạm vi quyền Google cấp.</p></div>
    <p className="guide-source"><a href="https://developers.google.com/apps-script/advanced/gmail" target="_blank" rel="noopener noreferrer">Gmail trong Apps Script · tài liệu Google ↗</a></p>
  </div>;
}

export function FileImportHelp() {
  return <div className="connection-steps">
    <NewTabLink href="https://umthcm.instructure.com/calendar">Mở lịch Canvas</NewTabLink>
    <ol>
      <li><strong>Tải lịch Canvas.</strong><p>Trong <b>Calendar / Lịch</b>, chọn <b>Calendar Feed / Nguồn cấp lịch</b> ở thanh bên phải → <b>Click to view Calendar Feed</b> để tải tệp <b>.ics</b>. Nếu máy mở ứng dụng Lịch, hủy thêm lịch và dùng tùy chọn tải liên kết xuống của trình duyệt.</p></li>
      <li><strong>Chọn tệp trong Daylight.</strong><p>Vào <b>Kết nối → Lịch Canvas hoặc email tải về</b> → chọn tệp <b>.ics</b> → xem trước tên và ngày → <b>Lưu vào Daylight</b>. Lịch này không cần access token hay quyền Outlook.</p></li>
      <li><strong>Cập nhật khi deadline đổi.</strong><p>Tải lịch mới và nhập lại <b>cùng tên tệp</b> để thay bản cũ. Đây là bản chụp thủ công, không tự cập nhật khi bấm Đồng bộ. Feed Canvas có tối đa 1.000 mục, khoảng 30 ngày trước đến 366 ngày tới, không gồm To-do. Không có điểm, kho tệp hay toàn bộ thông báo.</p></li>
      <li><strong>Nhập email riêng lẻ nếu cần.</strong><p>Trong Outlook web mở email → menu <b>⋯ → Save as / Lưu dưới dạng</b> để tải <b>.eml</b>. Về Daylight chọn tệp đó, xem trước rồi lưu. Chỉ nhập tiêu đề, người gửi và nội dung văn bản; không lưu tệp đính kèm.</p></li>
    </ol>
    <p>Giới hạn mỗi tệp 1 MB. Sự kiện cả ngày hiển thị “cả ngày” và không tự gán một giờ nhắc. Tệp quá phức tạp sẽ báo lỗi để bạn xuất lại; app không tự đoán giờ.</p>
    <p className="guide-source"><a href="https://community.instructure.com/en/instructure/kb/articles/662804-how-do-i-view-the-calendar-ical-feed-to-subscribe-to-an-external-calendar" target="_blank" rel="noopener noreferrer">Lịch iCal · hướng dẫn Canvas ↗</a></p>
  </div>;
}

export function ConnectionHelpPage() {
  useEffect(() => {
    const section = window.location.hash.slice(1);
    if (['canvas', 'outlook', 'gmail', 'nhap-tep'].includes(section)) document.getElementById(section)?.scrollIntoView();
  }, []);
  return <main className="connection-help-page">
    <header className="guide-page-header"><a className="brand" href="/"><img src="/icon.svg" alt=""/>daylight.</a><a className="secondary" href="/?page=connections"><Link2 size={16}/>Về mục Kết nối</a></header>
    <div className="guide-page-heading"><span className="eyebrow"><Sun size={15}/> MỞ TAB BÊN CẠNH, LÀM TỪNG BƯỚC THÔI</span><h1>Kết nối việc học,<br/><span>nhẹ nhàng từng chút.</span></h1><p>Các nút mở trang bên ngoài ở tab mới, để hướng dẫn này luôn ở đây cùng bạn.</p></div>
    <nav className="guide-jump" aria-label="Chọn hướng dẫn"><a href="#gmail"><Link2 size={17}/>Gmail · cầu nối thư trường</a><a href="#nhap-tep"><BookOpen size={17}/>Nhập lịch · không cần token</a><a href="#canvas">Canvas API</a><a href="#outlook">Outlook OAuth</a></nav>
    <section id="gmail" className="panel guide-section"><div className="guide-section-title"><span className="source-logo big outlook">G</span><div><p className="eyebrow">DÙNG GMAIL CÁ NHÂN</p><h2>Cầu nối email học tập</h2></div></div><GmailHelp/></section>
    <section id="nhap-tep" className="panel guide-section"><div className="guide-section-title"><span className="source-logo big canvas">↗</span><div><p className="eyebrow">LỊCH VÀ EMAIL BẠN ĐÃ TẢI</p><h2>Nhập tệp, dùng ngay</h2></div></div><FileImportHelp/><a className="primary" href="/?page=connections">Chọn tệp trong Daylight</a></section>
    <section id="canvas" className="panel guide-section"><div className="guide-section-title"><span className="source-logo big canvas">C</span><div><p className="eyebrow">BÀI TẬP, QUIZ, TÀI LIỆU VÀ LỊCH</p><h2>Kết nối Canvas của trường</h2></div></div><CanvasHelp/><a className="primary" href="/?page=connections">Tôi đã có token · về Daylight</a></section>
    <section id="outlook" className="panel guide-section"><div className="guide-section-title"><span className="source-logo big outlook">O</span><div><p className="eyebrow">EMAIL VÀ LỊCH MICROSOFT 365</p><h2>Kết nối Outlook của trường</h2></div></div><OutlookHelp/><a className="primary" href="/?page=connections">Đã cài đặt xong · về Daylight</a></section>
    <footer className="guide-page-footer">Từng chút một, cũng là tiến lên. ☀️</footer>
  </main>;
}
