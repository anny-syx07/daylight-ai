import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { syncHealth, itemSyncFlag } from '../src/syncHealth.js';
import type { ImportStatus, Item } from '../src/types.js';
const directory=mkdtempSync(join(tmpdir(),'daylight-sync-'));process.env.DATA_DIR=directory;delete process.env.DATABASE_URL;
const {canvasAutoDue}=await import('../server/auto-sync.js');
const {db}=await import('../server/store.js');
after(()=>{db?.close();rmSync(directory,{recursive:true,force:true});});

const now=Date.parse('2026-11-19T15:00:00Z');
const fresh=new Date(now-60000).toISOString();
const old=new Date(now-3*3600000).toISOString();
const imports:ImportStatus={count:90,gmail:{configured:true,lastReceived:fresh},sis:{count:90,configured:true,lastChecked:fresh}};

test('Canvas automation honors the interval, an explicit off switch and failed-attempt backoff',()=>{
  assert.equal(canvasAutoDue(true,true,old,undefined,now),true);
  assert.equal(canvasAutoDue(true,true,fresh,undefined,now),false);
  assert.equal(canvasAutoDue(true,true,old,fresh,now),false);
  assert.equal(canvasAutoDue(false,true,old,undefined,now),false);
  assert.equal(canvasAutoDue(true,false,old,undefined,now),false);
});
test('granted credentials do not masquerade as a running Gmail or SIS bridge; failures and stale data stay flagged',()=>{
  const good=syncHealth({canvas:{connected:true,lastSync:fresh},imports,clock:{lastCheck:fresh},automation:{canvas:{enabled:true,configured:true,intervalMinutes:30}}},now);
  assert.equal(good.find(s=>s.id==='canvas')!.state,'ok');
  assert.equal(good.find(s=>s.id==='gmail')!.state,'ok');
  assert.equal(good.find(s=>s.id==='sis')!.mode,'conditional');
  const stale=syncHealth({canvas:{connected:true,lastSync:old},imports:{...imports,gmail:{configured:true},sis:{count:90,configured:true}},clock:{lastCheck:fresh}},now);
  assert.equal(stale.find(s=>s.id==='canvas')!.state,'stale');
  assert.equal(stale.find(s=>s.id==='gmail')!.state,'stale');
  assert.match(stale.find(s=>s.id==='sis')!.label,/Chờ bật/);
  assert.equal(stale.find(s=>s.id==='outlook')!.mode,'disabled');
  const disabled=syncHealth({canvas:{connected:true,lastSync:fresh},imports,clock:{lastCheck:fresh},automation:{canvas:{enabled:false,configured:true,intervalMinutes:30}},remindersEnabled:false},now);
  assert.equal(disabled.find(s=>s.id==='canvas')!.mode,'manual');
  assert.equal(disabled.find(s=>s.id==='reminders')!.mode,'disabled');
});
test('file imports and dates filled from ICS stay manual even when Canvas itself updates automatically',()=>{
  const health=syncHealth({canvas:{connected:true,lastSync:fresh},imports,clock:{lastCheck:fresh}},now);
  const item:Item={id:'test',source:'import',kind:'event',title:'Test',course:'Test',due:fresh,importGroup:'calendar:test'};
  assert.equal(itemSyncFlag(item,health)!.mode,'manual');
  assert.equal(itemSyncFlag({...item,source:'canvas',kind:'assignment',importLabel:'Ngày hạn từ lịch .ics đã nhập'},health)!.label,'Hạn từ tệp · nhập lại');
  assert.equal(itemSyncFlag({...item,source:'canvas',kind:'assignment'},health),null);
});
