import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import webpush from 'web-push';
import { bridgeCode } from '../server/gmail-bridge.js';

const directory=mkdtempSync(join(tmpdir(),'daylight-reminders-'));
process.env.DATA_DIR=directory;delete process.env.DATABASE_URL;
const {get,set,db}=await import('../server/store.js');
const {sendReminders,nextReminderCheck,defaultSettings,runReminderClock,prepareTestPush}=await import('../server/reminders.js');
after(()=>{db?.close();rmSync(directory,{recursive:true,force:true});});
const now=Date.parse('2026-11-19T10:00:00Z');
const item=(due:number)=>({id:'manual:synthetic',source:'manual' as const,kind:'task' as const,title:'Synthetic reminder',course:'Test',due:new Date(due).toISOString()});

test('clock wakes at both known reminder boundaries, refreshes new schedules and retries delivery failures',()=>{
  const settings={...defaultSettings,reminders:true};
  assert.equal(nextReminderCheck([item(now+86400000+30000)],settings,now),now+30000);
  assert.equal(nextReminderCheck([item(now+3600000+45000)],settings,now),now+45000);
  assert.equal(nextReminderCheck([item(now+6000000)],settings,now),now+600000);
  assert.equal(nextReminderCheck([item(now+6000000)],settings,now,true),now+60000);
  assert.equal(nextReminderCheck([{...item(now+3600000+1000),completed:true}],settings,now),now+600000);
  assert.equal(nextReminderCheck([item(now+3600000+1000)],defaultSettings,now),now+600000);
  const beforeQuietEnd=Date.parse('2026-11-19T23:59:00Z');
  assert.equal(nextReminderCheck([],settings,beforeQuietEnd),beforeQuietEnd+60000);
});

test('background sends 24h/1h once per device, retries transient failures and removes expired subscriptions',async()=>{
  const original=webpush.sendNotification;const realNow=Date.now;let clock=now;
  const sent:any[]=[];let mode='ok';
  webpush.sendNotification=(async(subscription:any,payload:any,options:any)=>{if(mode!=='ok')throw {statusCode:Number(mode)};sent.push({endpoint:subscription.endpoint,payload:JSON.parse(payload),options});return {statusCode:201};}) as any;
  Date.now=()=>clock;
  try{
    await set('settings',{...defaultSettings,reminders:true,quietStart:0,quietEnd:0});
    await set('subscriptions',[{endpoint:'https://fcm.googleapis.com/synthetic',keys:{}}]);
    await set('manual',[item(now+7200000)]);
    await sendReminders();await sendReminders();assert.equal(sent.length,1);assert.match(sent[0].payload.tag,/:24h$/);
    clock=now+3600001;await sendReminders();await sendReminders();assert.equal(sent.length,2);assert.match(sent[1].payload.tag,/:1h$/);
    assert.equal(sent[1].options.urgency,'high');assert.ok(sent[1].options.TTL<=3600);
    await set('manual',[{...item(clock+1800000),id:'manual:retry'}]);mode='503';
    const result=await sendReminders();assert.equal(result!.failed,1);assert.equal((await get<any[]>('subscriptions',[])).length,1);
    mode='ok';await sendReminders();assert.equal(sent.length,3);
    await set('manual',[{...item(clock+1800000),id:'manual:expired'}]);mode='410';await sendReminders();assert.deepEqual(await get('subscriptions',[]),[]);
    mode='ok';await runReminderClock();assert.ok((await get<any>('reminder:clock',{})).lastCheck);
  }finally{Date.now=realNow;webpush.sendNotification=original;}
});

test('Google minute trigger honors server wake-ups and retries without requiring an open app',()=>{
  const props:Record<string,string>={};let clock=now;let requests=0;let succeeds=true;const triggers:any[]=[];
  const context:any={Date:{now:()=>clock},console:{log(){}},LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},PropertiesService:{getScriptProperties:()=>({getProperty:(key:string)=>props[key],setProperty:(key:string,value:string)=>{props[key]=value;},deleteProperty:(key:string)=>{delete props[key];}})},ScriptApp:{getProjectTriggers:()=>[],newTrigger:(name:string)=>({timeBased:()=>({everyMinutes:(minutes:number)=>({create:()=>triggers.push({name,minutes})})})})},UrlFetchApp:{fetch:(url:string,options:any)=>{requests++;assert.equal(url,'https://daylight.example/api/reminders/tick');assert.equal(options.followRedirects,false);return {getResponseCode:()=>succeeds?200:503,getContentText:()=>JSON.stringify({nextCheckAt:clock+45000})};}}};
  runInNewContext(bridgeCode({endpoint:'https://daylight.example/api/imports/gmail/receive',key:'synthetic'}),context);
  context.setupDaylightReminders();assert.deepEqual(triggers,[{name:'tickDaylightReminders',minutes:1}]);assert.equal(requests,1);
  context.tickDaylightReminders();assert.equal(requests,1);
  clock+=60000;succeeds=false;assert.throws(()=>context.tickDaylightReminders());
  succeeds=true;context.tickDaylightReminders();assert.equal(requests,3);
  assert.ok(!JSON.stringify(props).includes('Synthetic reminder'));
});

test('sound test only targets registered devices and is throttled; worker explicitly requests sound',async()=>{
  const original=webpush.sendNotification;let delivered:any;let calls=0;
  webpush.sendNotification=(async(subscription:any,payload:any)=>{calls++;delivered={subscription,payload:JSON.parse(payload)};return {statusCode:201};}) as any;
  try{
    const endpoint='https://web.push.apple.com/synthetic-test';await set('subscriptions',[{endpoint,keys:{}}]);
    await assert.rejects(prepareTestPush('https://unregistered.example'));
    const deliver=await prepareTestPush(endpoint);assert.equal(calls,0);
    await deliver();assert.equal(delivered.subscription.endpoint,endpoint);assert.match(delivered.payload.title,/thử tiếng chuông/);
    await assert.rejects(prepareTestPush(endpoint),/30 giây/);
    const handlers:Record<string,Function>={};let options:any;let work:Promise<unknown>|undefined;
    const self={addEventListener:(name:string,handler:Function)=>{handlers[name]=handler;},registration:{showNotification:async(_title:string,value:any)=>{options=value;}}};
    runInNewContext(readFileSync('public/sw.js','utf8'),{self});
    handlers.push({data:{json:()=>delivered.payload},waitUntil:(promise:Promise<unknown>)=>{work=promise;}});await work;
    assert.equal(options.silent,false);assert.equal(options.renotify,true);assert.deepEqual(Array.from(options.vibrate),[200,100,200]);
  }finally{webpush.sendNotification=original;}
});
