import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {formatEmail} from '../server/email-content.js';
import {emailTextRuns,safeEmailLink} from '../src/emailLinks.js';
import {bridgeCode} from '../server/gmail-bridge.js';

test('HTML paragraphs and labelled links survive while scripts, hidden preheaders, remote images and executable URLs do not',()=>{
  const content=formatEmail({html:'<html><head><style>body {color:red}</style></head><body><div style="display:none">HIDDEN</div><p>Chào bạn &amp; lớp,</p><p>Xem <a href="https://school.instructure.com/courses/12?x=1&amp;y=2"><strong>đề bài</strong></a> nhé.</p><ul><li>Đọc chương 1</li><li>Nộp bài</li></ul><a href="javascript:alert(1)">không chạy</a><script>SECRET_SCRIPT</script><img src="https://tracker.invalid/pixel"></body></html>'});
  const text=content.runs.map(r=>r.text).join('');assert.match(text,/Chào bạn & lớp,\n\n/);assert.match(text,/• Đọc chương 1/);assert.ok(!text.includes('HIDDEN'));assert.ok(!text.includes('SECRET_SCRIPT'));assert.ok(!JSON.stringify(content).includes('tracker.invalid'));assert.deepEqual(content.runs.find(r=>r.href),{text:'đề bài',href:'https://school.instructure.com/courses/12?x=1&y=2'});assert.ok(content.runs.every(r=>!r.href||r.href.startsWith('https:')));
});
test('plain text preserves line breaks and URL punctuation; output is bounded and never accepts executable links',()=>{
  const content=formatEmail({text:'Lịch học mới:\n\nXem https://school.edu/lesson_(1).\nLiên hệ mailto:teacher@school.edu',receivedAt:'1795442400000'});
  assert.ok(content.runs.some(r=>r.href==='https://school.edu/lesson_(1)'));assert.ok(content.runs.some(r=>r.href==='mailto:teacher@school.edu'));assert.equal(content.previewOnly,false);assert.ok(content.receivedAt);assert.equal(safeEmailLink('data:text/html,bad'),undefined);assert.equal(safeEmailLink('javascript:alert(1)'),undefined);assert.equal(safeEmailLink('https://user:password@school.edu'),undefined);
  const long=formatEmail({html:'<p>'+'nội dung '.repeat(10000)+'</p>'});assert.equal(long.truncated,true);assert.ok(long.runs.map(r=>r.text).join('').length<=18000);assert.ok(long.runs.length<=350);
  assert.equal(formatEmail({snippet:'Legacy preview'}).previewOnly,true);
});
test('Google bridge decodes MIME bodies, skips attachments, uses revisioned backfill markers and sends actual hrefs',()=>{
  const encode=(s:string)=>Buffer.from(s).toString('base64url');let requested='';const sent:any[]=[];
  const props:Record<string,string>={'sent:abc123':String(Date.now())};
  const payload={mimeType:'multipart/mixed',parts:[{mimeType:'multipart/alternative',parts:[{mimeType:'text/plain',body:{data:encode('Hello\n\nLink https://school.edu/work')}},{mimeType:'text/html',body:{data:encode('<p>Hello</p><a href="https://school.edu/work">Open work</a>')}}]},{mimeType:'text/plain',filename:'private.txt',body:{data:encode('ATTACHMENT_PRIVATE')}}]};
  const context:any={console:{log(){}},Date,LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},PropertiesService:{getScriptProperties:()=>({getProperties:()=>({...props}),deleteProperty:(k:string)=>delete props[k],setProperties:(v:any)=>Object.assign(props,v)})},Utilities:{base64DecodeWebSafe:(v:string)=>Buffer.from(v,'base64url'),newBlob:(v:any)=>({getDataAsString:()=>Buffer.from(v).toString('utf8')})},Gmail:{Users:{Labels:{list:()=>({labels:[{id:'label',name:'Daylight'}]})},Messages:{list:()=>({messages:[{id:'abc123'}]}),get:(_u:string,_id:string,options:any)=>{requested=options.format;return{id:'abc123',internalDate:'1795442400000',snippet:'Hello',payload};}}}},UrlFetchApp:{fetch:(_url:string,options:any)=>{sent.push(JSON.parse(options.payload));return{getResponseCode:()=>200};}}};
  runInNewContext(bridgeCode({endpoint:'https://daylight.invalid/api/imports/gmail/receive',key:'synthetic'}),context);context.syncDaylight();
  assert.equal(requested,'full');assert.equal(sent[0].messages[0].bodyHtml,'<p>Hello</p><a href="https://school.edu/work">Open work</a>');assert.ok(!JSON.stringify(sent).includes('ATTACHMENT_PRIVATE'));assert.ok(props['sent:v2:abc123']);
  sent.length=0;context.syncDaylight();assert.equal(sent[0].messages.length,0,'backfill upgrades each existing message once');
});
test('richer Gmail deliveries replace the same ID and cannot be downgraded by an old bridge retry',async()=>{
  process.env.DATA_DIR=mkdtempSync(join(tmpdir(),'daylight-mail-content-'));delete process.env.DATABASE_URL;
  const {get}=await import('../server/store.js');const{receiveGmail,importStatus,parseImport}=await import('../server/imports.js');
  const message={id:'abc123',subject:'Thư học tập',from:'Teacher',snippet:'Old preview'};
  await receiveGmail({messages:[message]});await receiveGmail({messages:[{...message,bodyHtml:'<p>Chào lớp</p><p><a href="https://school.edu/quiz">Làm quiz</a></p>'}]});await receiveGmail({messages:[message]});
  const items=await get<any[]>('imported',[]);assert.equal(items.length,1);assert.equal(items[0].content.previewOnly,false);assert.ok(items[0].content.runs.some((r:any)=>r.href==='https://school.edu/quiz'));await receiveGmail({messages:[]});assert.equal((await importStatus()).gmail.contentVersion,2);
  const eml=Buffer.from('From: Teacher <teacher@school.edu>\r\nSubject: Quiz\r\nContent-Type: text/html; charset=utf-8\r\n\r\n<p>Lịch quiz</p><a href="https://school.edu/quiz">Mở quiz</a>').toString('base64');const parsed=await parseImport('quiz.eml',eml);assert.ok(parsed.items[0].content?.runs.some(r=>r.href==='https://school.edu/quiz'));
});
