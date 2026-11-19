import { createHash, randomUUID } from 'node:crypto';
import webpush from 'web-push';
import { get, update, claim, release } from './store.js';
import { allItems } from './connectors.js';
import type { Item } from '../src/types.js';
import { defaultSettings, inQuietHours } from './reminders.js';

type Delivery = { accepted?: string; attempts: number; retryAt: number; error?: boolean };
interface Job { id: string; title: string; body: string; created: string; deliveries: Record<string, Delivery>; done?: string; }
interface State { initialized: boolean; seen: Record<string, boolean>; jobs: Job[]; lastScan?: string; lastAccepted?: string; invalidDevices: number; backlog: boolean; }
const empty = (): State => ({ initialized:false,seen:{},jobs:[],invalidDevices:0,backlog:false });
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export function isNewMessage(item: Item) { return item.importGroup === 'gmail' && item.kind === 'mail' || item.source === 'canvas' && ['announcement','discussion','assignment','quiz'].includes(item.kind); }

export async function collectNewMessages(items?: Item[]) {
  const messages = (items || await allItems()).filter(isNewMessage);
  const enabled = await get('notifications:enabled',true);
  await update<State>('notifications:state', empty(), state => {
    const stamp = new Date().toISOString();
    if (!state.initialized) return { ...state,initialized:true,seen:Object.fromEntries(messages.map(i=>[hash(i.id),true])),lastScan:stamp };
    const seen = { ...state.seen };
    const jobs = state.jobs.filter(j => !j.done || Date.parse(j.done) > Date.now() - 86400000);
    let backlog = false;
    for (const item of messages) {
      const id = hash(item.id);
      if (seen[id]) continue;
      if (!enabled) { seen[id]=true; continue; }
      if (jobs.filter(j=>!j.done).length >= 500) { backlog = true; continue; }
      const names: Record<string,string> = {mail:'Email mới',announcement:'Thông báo Canvas mới',discussion:'Thảo luận mới',assignment:'Bài tập mới',quiz:'Kiểm tra mới'};
      jobs.push({id,title:names[item.kind] || 'Tin mới',body:`${item.title} · ${item.course}`.slice(0,600),created:stamp,deliveries:{}});
      seen[id]=true;
    }
    return {...state,seen,jobs,lastScan:stamp,backlog};
  });
}
export async function deliverNewMessages() {
  if (!await get('notifications:enabled',true)) return;
  if (inQuietHours(new Date(),await get('settings',defaultSettings))) return;
  const owner=randomUUID();
  if (!await claim('lock:notifications',owner,180000)) return;
  try {
    const subscriptions=await get<webpush.PushSubscription[]>('subscriptions',[]);
    if (!subscriptions.length) return;
    const state=await get<State>('notifications:state',empty());
    let budget=12;
    const expiredTargets=new Set<string>();
    for (const job of state.jobs.filter(j=>!j.done)) {
      for (const subscription of subscriptions) {
        const target=hash(subscription.endpoint);
        if(expiredTargets.has(target)) continue;
        const delivery=job.deliveries[target];
        if (delivery?.accepted || delivery && delivery.retryAt > Date.now()) continue;
        if (budget-- <= 0) return;
        const attempts=(delivery?.attempts || 0)+1;
        try {
          await webpush.sendNotification(subscription,JSON.stringify({title:job.title,body:job.body,tag:`news:${job.id}`,url:'/'}),{TTL:7*86400,urgency:'high',timeout:10000});
          const stamp=new Date().toISOString();
          await update<State>('notifications:state',empty(),s=>({...s,lastAccepted:stamp,jobs:s.jobs.map(j=>j.id===job.id?{...j,deliveries:{...j.deliveries,[target]:{accepted:stamp,attempts,retryAt:0}}}:j)}));
          job.deliveries[target]={accepted:stamp,attempts,retryAt:0};
        } catch(error) {
          const expired=[404,410].includes((error as {statusCode?:number}).statusCode || 0);
          if(expired) { expiredTargets.add(target); await update<webpush.PushSubscription[]>('subscriptions',[],s=>s.filter(v=>v.endpoint!==subscription.endpoint)); }
          const retryAt=Date.now()+Math.min(3600000,60000*2**Math.min(attempts-1,6));
          await update<State>('notifications:state',empty(),s=>({...s,invalidDevices:s.invalidDevices+(expired?1:0),jobs:s.jobs.map(j=>j.id===job.id?{...j,deliveries:{...j.deliveries,[target]:{attempts,retryAt,error:true}}}:j)}));
        }
      }
      const current=await get<webpush.PushSubscription[]>('subscriptions',[]);
      if(current.length && current.every(s=>job.deliveries[hash(s.endpoint)]?.accepted)) await update<State>('notifications:state',empty(),s=>({...s,jobs:s.jobs.map(j=>j.id===job.id?{...j,done:new Date().toISOString()}:j)}));
    }
  } finally { await release('lock:notifications',owner); }
}
export async function notificationStatus() {
  const s=await get<State>('notifications:state',empty());
  const pending=s.jobs.filter(j=>!j.done);
  const retryAt=Math.min(...pending.flatMap(j=>Object.values(j.deliveries).filter(d=>!d.accepted).map(d=>d.retryAt)));
  const devices=(await get<webpush.PushSubscription[]>('subscriptions',[])).length;
  return { enabled:await get('notifications:enabled',true),initialized:s.initialized,pending:pending.length,failed:pending.filter(j=>Object.values(j.deliveries).some(d=>d.error && !d.accepted)).length,devices,invalidDevices:s.invalidDevices,quiet:inQuietHours(new Date(),await get('settings',defaultSettings)),backlog:s.backlog,lastScan:s.lastScan,lastAccepted:s.lastAccepted,nextRetry:Number.isFinite(retryAt)?retryAt:undefined };
}
