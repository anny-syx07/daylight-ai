import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {normalizeCanvasAddress} from '../src/canvasAddress.js';
import {canvasAddresses,publicCanvasIp} from '../server/canvas-network.js';
process.env.DATA_DIR=mkdtempSync(join(tmpdir(),'daylight-schools-'));
process.env.STORE_NAMESPACE='schools:';
const {get,set,inWorkspace,seal}=await import('../server/store.js');
const {pages,canvasOrigin,allItems,canvasModuleFiles,syncAll}=await import('../server/connectors.js');

test('school URLs normalize root HTTPS origins and reject credentials, IP literals and internal endpoints',()=>{
  assert.equal(normalizeCanvasAddress(' SCHOOL.instructure.com/login/canvas?next=/courses '),'https://school.instructure.com');
  assert.equal(normalizeCanvasAddress('https://canvas.school.edu.vn/profile/settings'),'https://canvas.school.edu.vn');
  for(const url of ['','http://canvas.school.edu','https://user:secret@canvas.school.edu','https://127.0.0.1','https://0x7f000001','https://2130706433','https://[::1]','https://canvas.school.edu:8443','https://metadata.google.internal','https://localhost','https://school.local','https://school.edu.','file:///etc/passwd'])assert.throws(()=>normalizeCanvasAddress(url),url);
});
test('socket DNS validation rejects mixed/private IPv4, IPv6, mapped, metadata and rebinding answers',async()=>{
  for(const ip of ['127.0.0.1','10.0.0.1','169.254.169.254','100.64.0.1','192.168.1.1','172.16.0.1','0.0.0.0','224.0.0.1','::1','fe80::1','fc00::1','::ffff:127.0.0.1','64:ff9b::a00:1','2001:db8::1'])assert.equal(publicCanvasIp(ip),false,ip);
  assert.equal(publicCanvasIp('8.8.8.8'),true);assert.equal(publicCanvasIp('2606:4700::1111'),true);
  let calls=0;
  const resolver=async()=>++calls===1?[{address:'8.8.8.8',family:4}]:[{address:'127.0.0.1',family:4}];
  assert.equal((await canvasAddresses('canvas.school.edu',resolver))[0].address,'8.8.8.8');
  await assert.rejects(canvasAddresses('canvas.school.edu',resolver));
  await assert.rejects(canvasAddresses('canvas.school.edu',async()=>[{address:'8.8.8.8',family:4},{address:'10.0.0.1',family:4}]));
});
test('concurrent workspaces choose distinct schools and refuse cross-school pagination without forwarding the token',async()=>{
  const a=`u_${'a'.repeat(64)}`,b=`u_${'b'.repeat(64)}`;
  const run=(id:string,school:string)=>inWorkspace(id,async()=>{
    await set('canvas-origin',school);
    let calls=0;
    const fetcher:typeof fetch=async(input,init)=>{calls++;assert.equal(new URL(String(input)).origin,school);assert.equal((init!.headers as any).Authorization,`Bearer token-${id}`);return new Response('[]',{headers:{Link:`<https://other-school.instructure.com/api/v1/courses?page=2>; rel="next"`}});};
    await assert.rejects(pages('/api/v1/courses',`token-${id}`,'canvas',fetcher));assert.equal(calls,1);assert.equal(await canvasOrigin(),school);
    const files=await canvasModuleFiles(12,'Course','synthetic',async()=>new Response(JSON.stringify([{id:1,items_count:1,items:[{id:2,type:'File',content_id:3,title:'File'}]}])));
    assert.equal(files[0].url,school+'/courses/12/modules/items/2');
  });
  await Promise.all([run(a,'https://one.instructure.com'),run(b,'https://canvas.school.edu.vn')]);
  assert.equal(await canvasOrigin(),'https://umthcm.instructure.com');
});
test('imported assignment IDs only supplement and deduplicate data from the same Canvas school',async()=>{
  const scope=`u_${'c'.repeat(64)}`;
  await inWorkspace(scope,async()=>{
    await set('canvas-origin','https://one.instructure.com');
    await set('partitions',['canvas:12:assignment']);
    await set('items:canvas:12:assignment',[{id:'canvas:assignment:12:34',source:'canvas',kind:'assignment',title:'One',course:'One',due:null,url:'https://one.instructure.com/courses/12/assignments/34'}]);
    const make=(school:string)=>({id:'import:'+school,source:'import',kind:'assignment',title:school,course:'Imported',canvasAssignmentId:34,due:'2026-11-25T10:00:00.000Z',url:`https://${school}/courses/12/assignments/34`});
    await set('imported',[make('two.instructure.com')]);
    let items=await allItems();assert.equal(items.length,2);assert.equal(items[0].due,null);
    await set('imported',[make('two.instructure.com'),make('one.instructure.com')]);
    items=await allItems();assert.equal(items.length,2);assert.equal(items[0].due,'2026-11-25T10:00:00.000Z');assert.equal(items[1].title,'two.instructure.com');
  });
});
test('complete concurrent syncs keep each school token, course, generated file links and events in its own workspace',async()=>{
  const actual=globalThis.fetch;
  const schools=['https://alpha.instructure.com','https://canvas.university.edu.vn'];
  const ids=[`u_${'d'.repeat(64)}`,`u_${'e'.repeat(64)}`];
  globalThis.fetch=async(input,init)=>{
    const url=new URL(String(input));const school=schools.indexOf(url.origin);assert.ok(school>=0);
    assert.equal((init!.headers as any).Authorization,`Bearer synthetic-school-${school}`);
    assert.equal(init!.redirect,'error');
    let data:unknown=[];
    if(url.pathname.endsWith('/profile'))data={id:1,name:`Student ${school}`};
    else if(url.pathname==='/api/v1/courses')data=[{id:12,name:`Course ${school}`}];
    else if(url.pathname.endsWith('/assignments'))data=[{id:34,name:`Assignment ${school}`,due_at:'2026-12-01T00:00:00Z',html_url:url.origin+'/courses/12/assignments/34'}];
    else if(url.pathname.endsWith('/files'))data=[{id:56,display_name:`File ${school}`}];
    else if(url.pathname.endsWith('/calendar_events'))data=[{id:78,title:`Class ${school}`,context_name:`Course ${school}`,start_at:'2026-12-02T01:00:00Z',html_url:url.origin+'/calendar'}];
    return new Response(JSON.stringify(data));
  };
  try{await Promise.all(ids.map((id,i)=>inWorkspace(id,async()=>{
    await set('canvas-origin',schools[i]);await set('canvas-token',seal(`synthetic-school-${i}`));await syncAll();
    const connection=await get<any>('connection:canvas',{});assert.equal(connection.connected,true);assert.equal(connection.canvasUrl,schools[i]);
    const items=await allItems();assert.equal(items.length,3);assert.ok(items.every(item=>item.url?.startsWith(schools[i]+'/')));assert.equal(items.find(item=>item.kind==='file')!.url,schools[i]+'/courses/12/files/56');
  })));}finally{globalThis.fetch=actual;}
});
