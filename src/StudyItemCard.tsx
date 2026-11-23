import {useId,useState} from 'react';
import {ArrowUpRight,Check,ChevronDown,ChevronUp,Clock,FileText,Mail,Plus,Trash2,CalendarDays,ClipboardList,MessageCircle} from 'lucide-react';
import type {Item} from './types';
import type {SyncHealth} from './syncHealth';
import {SyncFlag} from './SyncOverview';
import {emailTextRuns,safeEmailLink,type EmailRun} from './emailLinks';
import './email.css';
function excerpt(runs:EmailRun[],limit:number){let left=limit;return runs.flatMap(run=>{if(left<=0)return[];const text=run.text.slice(0,left);left-=text.length;return[{...run,text}];});}
export function StudyItemCard({item,label,date,status,onToggle,onDelete,onTask,onSnooze,onConnections,compact=false}:{item:Item;label:string;date:string;status:SyncHealth|null;onToggle:()=>void;onDelete:()=>void;onTask:()=>void;onSnooze:()=>void;onConnections:()=>void;compact?:boolean}){
  const [open,setOpen]=useState(false);const bodyId=useId();const isTask=['assignment','quiz','discussion','task'].includes(item.kind);const isMail=item.kind==='mail';
  const content=item.content;const runs=content?.runs?.length?content.runs:emailTextRuns(item.detail||'');const text=runs.map(r=>r.text).join('');const limit=compact?120:240;const long=text.length>limit;
  const visible=open||!long?runs:excerpt(runs,limit);const url=safeEmailLink(item.url);const stamp=content?.receivedAt;
  const Icon=isMail?Mail:item.kind==='event'?CalendarDays:item.kind==='announcement'?MessageCircle:isTask?ClipboardList:FileText;
  return <article className={`study-item-card ${item.completed?'item-finished':''}`}>
    <header className="item-card-header">{isTask?<button className="item-check" aria-pressed={Boolean(item.completed)} aria-label={`${item.completed?'Đánh dấu chưa xong':'Đánh dấu xong trong Daylight'}: ${item.title}`} onClick={onToggle}><span>{item.completed&&<Check size={15}/>}</span></button>:<span className="item-avatar" aria-hidden="true"><Icon size={19}/></span>}
      <div className="item-heading"><p className="item-course">{item.course}</p><h3>{item.title}</h3><div className="item-meta"><span className={`item-kind ${item.kind}`}>{label}</span>{(item.due||isTask)&&<span className="item-date"><Clock size={12}/>{date}</span>}{stamp&&!item.due&&<time dateTime={stamp}>{new Date(stamp).toLocaleString('vi-VN',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</time>}{item.completed&&<span>Đã xong</span>}</div></div>
    </header>
    {item.location&&<p className="item-location"><CalendarDays size={14}/>{item.location}{item.instructor&&<span> · {item.instructor}</span>}</p>}
    {text.trim()&&<div id={bodyId} className="item-body">{visible.map((run,i)=>{const href=safeEmailLink(run.href);return href?<a key={i} href={href} target="_blank" rel="noopener noreferrer" title={href}>{run.text}<ArrowUpRight size={12} aria-hidden="true"/></a>:<span key={i}>{run.text}</span>;})}{!open&&long&&'…'}</div>}
    {long&&<button className="item-expand" aria-expanded={open} aria-controls={bodyId} onClick={()=>setOpen(!open)}>{open?'Thu gọn':'Đọc tiếp'}{open?<ChevronUp size={15}/>:<ChevronDown size={15}/>}</button>}
    {content?.truncated&&<p className="item-source-note">Nội dung dài đã được rút gọn. Mở bản gốc để xem phần còn lại.</p>}
    {isMail&&(!content||content.previewOnly)&&<p className="item-source-note">Đang có đoạn trích; bản gốc vẫn có đầy đủ nội dung và link.</p>}
    {status&&<div className="item-sync-status"><SyncFlag status={status} onClick={onConnections}/></div>}
    <footer className="item-actions">{url&&<a href={url} target="_blank" rel="noopener noreferrer">{isMail?'Mở thư gốc':item.source==='canvas'?'Mở Canvas':item.kind==='file'?'Mở tài liệu':'Mở bản gốc'}<ArrowUpRight size={15}/></a>}{isMail&&<button onClick={onTask}><Plus size={15}/>Tạo việc</button>}{item.due&&!item.allDay&&!item.completed&&<button onClick={onSnooze} title="Hoãn nhắc một giờ"><Clock size={15}/>Hoãn 1 giờ</button>}{(item.source==='manual'||item.source==='import')&&<button className="item-remove" onClick={onDelete} aria-label={`Xóa ${item.title} khỏi Daylight`}><Trash2 size={15}/></button>}</footer>
  </article>;
}
