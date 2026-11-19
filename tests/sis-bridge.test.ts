import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { unzipSync, strFromU8 } from 'fflate';
import { extensionFiles, sisReaderCode } from '../server/sis-extension.js';

const directory = mkdtempSync(join(tmpdir(), 'daylight-sis-'));
process.env.DATA_DIR = directory; delete process.env.DATABASE_URL;
const { get, set, db } = await import('../server/store.js');
const { previewImport, commitImport, importStatus } = await import('../server/imports.js');
const { sisSetup, sisAuthorized, receiveSis, revokeSis } = await import('../server/sis-bridge.js');
after(() => { db?.close(); rmSync(directory, { recursive: true, force: true }); });
const fixture = () => ({ schema:'daylight.sis-schedule.v1',term:'FALL_2026',timezone:'Asia/Ho_Chi_Minh',capturedAt:new Date().toISOString(),courses:[{name:'Synthetic class',code:'1',source:'https://sis.umt.edu.vn/attendance/aaaa-bbbb',rows:[{date:'20/11/2026',time:'07:00 - 09:30',room:'P.404',building:'Building',type:'LEC',instructor:'Teacher'},{date:'27/11/2026',time:'07:00 - 09:30',room:'P.404',type:'LEC'}]}] });

test('SIS key is private and revocable; full updates replace room/time/cancellation without touching mail', async () => {
  const data = fixture();
  const preview = await previewImport('FALL_2026.sis.json', Buffer.from(JSON.stringify(data)).toString('base64'));
  await commitImport(preview.id);
  await set('imported', [...await get<any[]>('imported', []), { id:'mail',importGroup:'gmail',kind:'mail' }]);
  const zip = unzipSync(await sisSetup('https://daylight.example'));
  const config = JSON.parse(strFromU8(zip['config.json']));
  assert.equal(await sisAuthorized(`Bearer ${config.key}`), true);
  assert.equal(await sisAuthorized('Bearer wrong'), false);
  assert.ok(!(await get<string>('sis:secret','')).includes(config.key));
  assert.ok(!JSON.stringify(await importStatus()).includes(config.key));
  const changed = fixture(); changed.courses[0].rows[0].room = 'P.501'; changed.courses[0].rows.splice(1,1);
  assert.deepEqual(await receiveSis(changed), { count:1,changed:2 });
  assert.equal((await get<any[]>('imported',[])).filter(i=>i.importGroup==='sis:FALL_2026').length,1);
  assert.equal((await get<any[]>('imported',[])).find(i=>i.id==='mail').kind,'mail');
  const before = await get('imported',[]);
  const partial = fixture(); partial.courses=[];
  await assert.rejects(receiveSis(partial));
  const empty=fixture();empty.courses[0].rows=[];
  await assert.rejects(receiveSis(empty));
  await assert.rejects(receiveSis({...fixture(),capturedAt:'2020-01-01T00:00:00Z'}));
  const unexpected=fixture();unexpected.courses[0].source='https://sis.umt.edu.vn/attendance/cccc-dddd';
  await assert.rejects(receiveSis(unexpected));
  await receiveSis({error:'signin'});
  assert.deepEqual(await get('imported',[]),before);
  assert.match((await importStatus()).sis!.error!, /đăng nhập/);
  assert.ok((await importStatus()).sis!.lastChecked);
  await revokeSis(); assert.equal(await sisAuthorized(`Bearer ${config.key}`),false);
});

test('SIS DOM reader rejects partial pages and exports no attendance marks', async () => {
  const cells = ['1','20/11/2026','07:00 - 09:30','PRIVATE ATTENDANCE','P.404','Building','LEC','Teacher'];
  const table = {innerText:'ATTENDANCES',querySelectorAll:(selector:string)=>selector==='thead th'?['#','DATE','TIME','ATTENDANCES','ROOM','LOCATION','TYPE','FACULTY'].map(innerText=>({innerText})):[{querySelectorAll:()=>cells.map(innerText=>({innerText}))}]};
  const body={innerText:'Showing1-1of1\n2026 © UMT'};
  const context:any={URL,location:new URL(fixture().courses[0].source),document:{body,querySelectorAll:()=>[table]}};
  runInNewContext(sisReaderCode,context);
  const result=await context.readCourse(fixture().courses[0]);
  assert.equal(result.rows[0].room,'P.404');
  assert.ok(!JSON.stringify(result).includes('PRIVATE ATTENDANCE'));
  body.innerText='Showing1-1of2\n2026 © UMT';
  await assert.rejects(context.readCourse(fixture().courses[0]),/partial/);
});

test('Chrome bridge closes only its tabs and never submits a partial semester when a course fails', async () => {
  const course=fixture().courses[0];const courses=[course,{...course,code:'2',source:'https://sis.umt.edu.vn/attendance/cccc-dddd'}];
  const config={term:'FALL_2026',courses:courses.map(({rows,...c})=>c),endpoint:'https://daylight.example/api/imports/sis/receive',key:'synthetic'};
  const state:any={enabled:true};const created:any[]=[];const removed:number[]=[];const posted:any[]=[];let failing=true;
  const chrome={runtime:{getURL:()=> 'extension://config.json',getPlatformInfo:async()=>({}),onStartup:{addListener(){}},onInstalled:{addListener(){}},onMessage:{addListener(){}}},storage:{local:{get:async()=>state,set:async(v:any)=>Object.assign(state,v)}},alarms:{get:async()=>({}),create:async()=>{},onAlarm:{addListener(){}}},action:{setBadgeText:async()=>{},setBadgeBackgroundColor:async()=>{}},tabs:{create:async(o:any)=>{const tab={id:created.length+1,url:o.url,status:'complete'};created.push(tab);return tab;},get:async(id:number)=>created[id-1],remove:async(id:number)=>{removed.push(id);}},scripting:{executeScript:async(o:any)=>{if(failing&&o.target.tabId===2)throw Error('signin');return [{result:{...o.args[0],rows:course.rows}}];}}};
  const context:any={chrome,URL,AbortSignal,setTimeout,setInterval,clearInterval,fetch:async(url:string,options:any)=>{if(url.startsWith('extension:'))return {json:async()=>config};posted.push(JSON.parse(options.body));return {ok:true,json:async()=>({changed:0})};}};
  runInNewContext(extensionFiles(config)['background.js'],context);
  await context.syncSchedule();
  assert.deepEqual(removed,[1,2]);assert.equal(posted.length,1);assert.equal(posted[0].error,'signin');assert.ok(!posted.some(x=>x.schema));
  failing=false;await context.syncSchedule();
  assert.equal(posted.at(-1).courses.length,2);assert.deepEqual(removed,[1,2,3,4]);assert.match(state.state,/Lịch không đổi/);
});
