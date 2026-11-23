import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createApi} from '../src/api.js';
test('a failed session service keeps the app signed in instead of treating a 401 as logout',async()=>{
  let signedOut=0;const urls:string[]=[];
  const api=createApi(async(url,options)=>{urls.push(String(url));assert.equal(options?.credentials,'same-origin');assert.equal(options?.cache,'no-store');return String(url)==='/api/session'?new Response('{}',{status:503}):new Response('{}',{status:401});},()=>signedOut++);
  await assert.rejects(api('/dashboard'),/Chưa kiểm tra được/);assert.equal(signedOut,0);assert.deepEqual(urls,['/api/dashboard','/api/session']);
});
test('a transient 401 is retried after the server confirms the same session is still valid',async()=>{
  let signedOut=0,attempts=0;
  const api=createApi(async(url)=>String(url)==='/api/session'?new Response('{"authenticated":true}'):++attempts===1?new Response('{}',{status:401}):new Response('{"items":[]}'),()=>signedOut++);
  assert.deepEqual(await api('/dashboard'),{items:[]});assert.equal(attempts,2);assert.equal(signedOut,0);
});
test('a confirmed expired or revoked session still signs out, while an offline check does not',async()=>{
  let signedOut=0;
  const expired=createApi(async(url)=>String(url)==='/api/session'?new Response('{"authenticated":false}'):new Response('{}',{status:401}),()=>signedOut++);
  await assert.rejects(expired('/dashboard'),/Phiên đã kết thúc/);assert.equal(signedOut,1);
  const offline=createApi(async(url)=>{if(String(url)==='/api/session')throw Error('offline');return new Response('{}',{status:401});},()=>signedOut++);
  await assert.rejects(offline('/dashboard'),/vẫn được giữ/);assert.equal(signedOut,1);
});
