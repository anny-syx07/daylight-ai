import type webpush from 'web-push';
import { createHash } from 'node:crypto';
import { get,set,update,inWorkspace,workspaceId } from './store.js';
const key=(endpoint:string)=>`push:device:${createHash('sha256').update(endpoint).digest('hex')}`;
export async function ownsDevice(endpoint:string){
  const workspace=workspaceId();
  const assigned=await inWorkspace('owner',()=>get<string|null>(key(endpoint),null));
  // Existing owner subscriptions predate the public account registry.
  return assigned===workspace || (!assigned && workspace==='owner');
}
export async function bindDevice(subscription:webpush.PushSubscription){
  const workspace=workspaceId();
  const previous=await inWorkspace('owner',()=>get<string|null>(key(subscription.endpoint),null));
  await inWorkspace('owner',()=>set(key(subscription.endpoint),workspace));
  const old=previous || 'owner';
  if(old!==workspace && (old==='owner'||/^u_[a-f0-9]{64}$/.test(old)))await inWorkspace(old,()=>update<webpush.PushSubscription[]>('subscriptions',[],s=>s.filter(v=>v.endpoint!==subscription.endpoint)));
  await update<webpush.PushSubscription[]>('subscriptions',[],s=>[...s.filter(v=>v.endpoint!==subscription.endpoint),subscription]);
}
export async function unbindDevice(endpoint:unknown){
  if(typeof endpoint!=='string' || !await ownsDevice(endpoint))return;
  await inWorkspace('owner',()=>set(key(endpoint),'signed-out'));
  await update<webpush.PushSubscription[]>('subscriptions',[],s=>s.filter(v=>v.endpoint!==endpoint));
}
