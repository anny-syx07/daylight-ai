import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import webpush from 'web-push';
import type { Item } from '../src/types.js';

const directory=mkdtempSync(join(tmpdir(),'daylight-news-'));process.env.DATA_DIR=directory;delete process.env.DATABASE_URL;
const {set,get,remove,db}=await import('../server/store.js');
const {collectNewMessages,deliverNewMessages,notificationStatus,isNewMessage}=await import('../server/notifications.js');
after(()=>{db?.close();rmSync(directory,{recursive:true,force:true});});
const mail=(id:string):Item=>({id,source:'import',importGroup:'gmail',kind:'mail',title:'Synthetic message',course:'Sender',due:null});

test('initial data is baselined; every new relevant ID queues once and files/grades never create a flood',async()=>{
  await set('settings',{reminders:true,quietStart:0,quietEnd:0,timezone:'Asia/Ho_Chi_Minh'});
  const before=[mail('old')];await collectNewMessages(before);assert.equal((await notificationStatus()).pending,0);
  const next=[...before,mail('new'),{...mail('a'),source:'canvas' as const,kind:'announcement' as const},{...mail('b'),source:'canvas' as const,kind:'assignment' as const},{...mail('f'),source:'canvas' as const,kind:'file' as const}];
  await collectNewMessages(next);await collectNewMessages(next);
  assert.equal((await notificationStatus()).pending,3);
  assert.equal(isNewMessage({...mail('manual'),importGroup:'mail:file'}),false);
});
test('per-device delivery persists successes, retries failed devices and never re-sends successful deliveries',async()=>{
  const real=webpush.sendNotification;const actualNow=Date.now;let now=actualNow();let fail=true;const calls:string[]=[];
  Date.now=()=>now;
  const a={endpoint:'https://fcm.googleapis.com/a',keys:{}};const b={endpoint:'https://web.push.apple.com/b',keys:{}};
  await set('subscriptions',[a,b]);
  webpush.sendNotification=(async(s:any,payload:any,options:any)=>{calls.push(s.endpoint);assert.match(JSON.parse(payload).tag,/^news:/);assert.equal(options.urgency,'high');if(s.endpoint===b.endpoint&&fail)throw {statusCode:503};return {statusCode:201};}) as any;
  try{
    await deliverNewMessages();assert.equal((await notificationStatus()).pending,3);assert.equal((await notificationStatus()).failed,3);
    now+=120000;fail=false;await deliverNewMessages();
    assert.equal((await notificationStatus()).pending,0);assert.equal(calls.filter(v=>v===a.endpoint).length,3);assert.equal(calls.filter(v=>v===b.endpoint).length,6);
    const total=calls.length;await deliverNewMessages();assert.equal(calls.length,total);
    assert.ok((await get<any>('notifications:state',null)).jobs.every((j:any)=>j.done));
  }finally{webpush.sendNotification=real;Date.now=actualNow;}
});
test('quiet hours hold new messages for later and an expired phone is flagged instead of silently ignored',async()=>{
  await remove('notifications:state');await collectNewMessages([]);await collectNewMessages([mail('night')]);
  const hour=Number(new Intl.DateTimeFormat('en',{timeZone:'Asia/Ho_Chi_Minh',hour:'numeric',hourCycle:'h23'}).format(new Date()));
  await set('settings',{reminders:true,quietStart:hour,quietEnd:(hour+1)%24,timezone:'Asia/Ho_Chi_Minh'});
  const real=webpush.sendNotification;let calls=0;
  webpush.sendNotification=(async()=>{calls++;throw {statusCode:410};}) as any;
  try{
    await set('subscriptions',[{endpoint:'https://fcm.googleapis.com/expired',keys:{}}]);
    await deliverNewMessages();assert.equal(calls,0);assert.equal((await notificationStatus()).pending,1);
    await set('settings',{reminders:true,quietStart:0,quietEnd:0,timezone:'Asia/Ho_Chi_Minh'});
    await deliverNewMessages();assert.equal(calls,1);assert.equal((await notificationStatus()).invalidDevices,1);assert.equal((await notificationStatus()).devices,0);assert.equal((await notificationStatus()).pending,1);
  }finally{webpush.sendNotification=real;}
});
