import { strToU8, zipSync } from 'fflate';
import type { SisCatalog } from '../src/types.js';

// Runs in the isolated extension world. Only rendered timetable columns are exported.
export const sisReaderCode = String.raw`async function readCourse(expected) {
  const until = Date.now() + 25000;
  while (Date.now() < until) {
    if (location.origin !== 'https://sis.umt.edu.vn' || location.pathname !== new URL(expected.source).pathname) throw Error('signin');
    const table = [...document.querySelectorAll('table')].find(t => t.innerText.includes('ATTENDANCES'));
    if (table) {
      const headers = [...table.querySelectorAll('thead th')].map(x => x.innerText.trim());
      if (headers.join('|') !== '#|DATE|TIME|ATTENDANCES|ROOM|LOCATION|TYPE|FACULTY') throw Error('layout');
      const footer = document.body.innerText.match(/Showing\s*(\d+)\s*[-–]\s*(\d+)\s*of\s*(\d+)(?!\d)/i);
      const raw = [...table.querySelectorAll('tbody tr')].map(r => [...r.querySelectorAll('td')].map(x => x.innerText.trim()));
      if (footer && raw.length) {
        if (+footer[1] !== 1 || +footer[2] !== +footer[3] || raw.length !== +footer[3] || raw.length > 200) throw Error('partial');
        if (raw.some(c => c.length !== 8 || !/^\d{2}\/\d{2}\/\d{4}$/.test(c[1]) || !/^\d{2}:\d{2}\s*[-–]\s*\d{2}:\d{2}$/.test(c[2]))) throw Error('layout');
        const rows = raw.map(c => ({date:c[1],time:c[2],room:c[4],building:c[5],type:c[6],instructor:c[7]}));
        return {...expected, rows};
      }
    }
    await new Promise(resolve => setTimeout(resolve, 400));
  }
  throw Error('unavailable');
}`;

export function extensionFiles(config: SisCatalog & { endpoint: string; key: string }) {
  const origin = new URL(config.endpoint).origin;
  const background = `${sisReaderCode}\n` + String.raw`
let running = false;
const configPromise = fetch(chrome.runtime.getURL('config.json')).then(r => r.json());
async function post(config, body) {
  const r = await fetch(config.endpoint, {method:'POST', credentials:'omit', redirect:'error', headers:{'Content-Type':'application/json',Authorization:'Bearer '+config.key},body:JSON.stringify(body),signal:AbortSignal.timeout(25000)});
  if (!r.ok) throw Error(r.status === 401 ? 'revoked' : 'delivery');
  return r.json();
}
async function readTab(course) {
  const tab = await chrome.tabs.create({url:course.source,active:false});
  try {
    const deadline = Date.now()+30000;
    let loaded = false;
    while (Date.now()<deadline) {
      const current = await chrome.tabs.get(tab.id);
      if (current.status==='complete') {
        if (!current.url || new URL(current.url).origin!=='https://sis.umt.edu.vn' || new URL(current.url).pathname!==new URL(course.source).pathname) throw Error('signin');
        loaded = true; break;
      }
      await new Promise(resolve=>setTimeout(resolve,400));
    }
    if (!loaded) throw Error('unavailable');
    const result = await chrome.scripting.executeScript({target:{tabId:tab.id},func:readCourse,args:[course]});
    if (!result[0]?.result?.rows?.length) throw Error('partial');
    return result[0].result;
  } finally { await chrome.tabs.remove(tab.id).catch(()=>{}); }
}
async function syncSchedule() {
  if (running) return;
  const {enabled} = await chrome.storage.local.get('enabled');
  if (!enabled) return;
  running=true;
  await chrome.storage.local.set({state:'Đang kiểm tra SIS…'});
  const keepAlive=setInterval(()=>{void chrome.runtime.getPlatformInfo();},20000);
  let config;
  try {
    config=await configPromise;
    const capturedAt=new Date().toISOString();
    const courses=[];
    for (const course of config.courses) courses.push(await readTab(course));
    if (!(await chrome.storage.local.get('enabled')).enabled) return;
    const result=await post(config,{schema:'daylight.sis-schedule.v1',term:config.term,timezone:'Asia/Ho_Chi_Minh',capturedAt,courses});
    const state='Đã kiểm tra '+new Date().toLocaleString('vi-VN')+' · '+(result.changed ? result.changed+' mục thay đổi' : 'Lịch không đổi');
    await chrome.storage.local.set({state,lastSuccess:Date.now()});
    await chrome.action.setBadgeText({text:''});
  } catch(error) {
    const code=['signin','layout','partial','revoked','delivery'].includes(error.message)?error.message:'unavailable';
    const state=code==='signin'?'Mở SIS và đăng nhập lại trong Chrome này.':code==='revoked'?'Khóa đã thu hồi. Tải lại cầu nối từ Daylight.':'Chưa kiểm tra được. Lịch cũ được giữ nguyên.';
    await chrome.storage.local.set({state});
    await chrome.action.setBadgeText({text:'!'});
    await chrome.action.setBadgeBackgroundColor({color:'#8575bb'});
    if(config && !['delivery','revoked'].includes(code)) await post(config,{error:code}).catch(()=>{});
  } finally {clearInterval(keepAlive);running=false;}
}
async function ensureAlarm(){if(!await chrome.alarms.get('sis-check'))await chrome.alarms.create('sis-check',{periodInMinutes:60});}
chrome.alarms.onAlarm.addListener(alarm=>{if(alarm.name==='sis-check')void syncSchedule();});
chrome.runtime.onStartup.addListener(()=>{void ensureAlarm();void syncSchedule();});
chrome.runtime.onInstalled.addListener(()=>{void ensureAlarm();});
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  if(sender.id!==chrome.runtime.id)return;
  if(message.action==='sync'){void chrome.storage.local.set({enabled:true}).then(()=>syncSchedule());reply({ok:true});}
  if(message.action==='stop'){void chrome.storage.local.set({enabled:false,state:'Đã tạm dừng'});reply({ok:true});}
});
void ensureAlarm();
`;
  const popup = String.raw`const status=document.querySelector('#status');
async function refresh(){const data=await chrome.storage.local.get(['state','enabled']);status.textContent=data.state||'Chưa bật cập nhật';document.querySelector('#sync').textContent=data.enabled?'Kiểm tra ngay':'Bật cập nhật';}
document.querySelector('#sync').onclick=async()=>{await chrome.runtime.sendMessage({action:'sync'});status.textContent='Đang kiểm tra SIS…';};
document.querySelector('#stop').onclick=async()=>{await chrome.runtime.sendMessage({action:'stop'});await refresh();};
fetch('config.json').then(r=>r.json()).then(c=>{document.querySelector('#app').href=new URL(c.endpoint).origin;});
chrome.storage.onChanged.addListener(()=>{void refresh();});void refresh();`;
  return {
    'manifest.json': JSON.stringify({ manifest_version: 3, name: 'Daylight · SIS UMT', version: '0.1.0', minimum_chrome_version: '120', description: 'Đọc thời khóa biểu SIS đã đăng nhập và cập nhật lịch Daylight của bạn.', permissions: ['alarms', 'scripting', 'storage'], host_permissions: ['https://sis.umt.edu.vn/*', `${origin}/*`], background: { service_worker: 'background.js' }, action: { default_popup: 'popup.html' } }, null, 2),
    'config.json': JSON.stringify(config),
    'background.js': background,
    'popup.js': popup,
    'popup.html': '<!doctype html><html lang="vi"><meta charset="utf-8"><title>Daylight SIS</title><style>body{width:280px;padding:18px;font:15px system-ui;color:#363647;background:#f8f7fb}button,a{display:block;margin:12px 0;padding:10px;border:0;border-radius:10px;background:#e8e3f5;color:#494064;text-decoration:none}p{line-height:1.5}</style><h2>Daylight ✳ SIS</h2><p id="status" role="status">Đang tải…</p><button id="sync">Bật cập nhật</button><button id="stop">Tạm dừng</button><a href="https://sis.umt.edu.vn/my-schedule" target="_blank" rel="noreferrer">Mở SIS để đăng nhập ↗</a><a id="app" target="_blank" rel="noreferrer">Mở Daylight ↗</a><p>Kiểm tra khoảng mỗi giờ khi Chrome đang chạy, máy thức và SIS còn đăng nhập. Chỉ đọc lịch của các môn trong học kỳ đã nhập.</p><script src="popup.js"></script></html>',
    'HUONG-DAN.txt': 'DAYLIGHT · SIS UMT\n1. Giải nén thư mục này, giữ riêng vì config.json có khóa ghi lịch.\n2. Trong Chrome mở chrome://extensions → bật Developer mode → Load unpacked → chọn thư mục đã giải nén.\n3. Đăng nhập sis.umt.edu.vn trong cùng hồ sơ Chrome.\n4. Mở biểu tượng Daylight SIS → Bật cập nhật.\nChỉ đọc bảng ngày/giờ/phòng/loại buổi/giảng viên của các môn đã nhập. Không đọc mật khẩu, cookie hoặc trạng thái điểm danh. Chưa tự phát hiện môn mới hoặc học kỳ mới: cần nhập lại danh sách môn.\nChrome phải chạy, máy phải thức và SIS phải còn đăng nhập. Lịch cũ được giữ khi lỗi hoặc bảng thiếu trang. Xem thời gian kiểm tra ở Daylight → Kết nối.\nDừng: Tạm dừng hoặc gỡ tiện ích. Thu hồi khóa: Daylight → Kết nối → Ngắt cầu nối SIS.\n',
  };
}
export function extensionZip(config: Parameters<typeof extensionFiles>[0]) {
  return zipSync(Object.fromEntries(Object.entries(extensionFiles(config)).map(([name, text]) => [name, strToU8(text)])));
}
