import { useState } from 'react';
import { CanvasHelp } from './ConnectionHelp';
import { normalizeCanvasAddress } from './canvasAddress';
export function CanvasConnectionFields({initialUrl}:{initialUrl?:string}){
  const [canvasUrl,setCanvasUrl]=useState(initialUrl||'');
  let changed=false;try{changed=Boolean(initialUrl&&normalizeCanvasAddress(canvasUrl)!==initialUrl);}catch{}
  return <><label>Địa chỉ Canvas của trường<input name="canvasUrl" type="text" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="url" required value={canvasUrl} onChange={e=>setCanvasUrl(e.target.value)} placeholder="https://truong.instructure.com" maxLength={2048}/></label><p className="privacy-note">Dán link Canvas chính thức, ví dụ truong.instructure.com hoặc canvas.truong.edu.vn. Daylight tự lấy địa chỉ gốc.</p>{changed&&<p className="notice">Đổi trường sẽ thay dữ liệu Canvas đang kết nối và trạng thái hoàn thành của nguồn đó. Gmail, lịch nhập và việc cá nhân vẫn được giữ.</p>}<label>Access token<input type="password" name="token" autoComplete="off" required minLength={10} placeholder="Token được tạo ở đúng Canvas phía trên"/></label><details className="canvas-modal-help"><summary>Chưa có token? Xem từng bước tại đây</summary><CanvasHelp compact canvasUrl={canvasUrl}/><a className="text-button" href="/huong-dan#canvas" target="_blank" rel="noopener noreferrer">Mở hướng dẫn đầy đủ ở tab mới</a></details></>;
}
