import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loginMode,readLoginMode,rememberLoginMode} from '../src/loginMode.js';
test('PWA reopens the last authenticated login method without storing a password or session token',()=>{
  const data:Record<string,string>={};const storage={getItem:(k:string)=>data[k]||null,setItem:(k:string,v:string)=>{data[k]=v;}};
  assert.equal(loginMode('/app','',readLoginMode(storage)),'member');
  rememberLoginMode('owner',storage);assert.equal(loginMode('/app','',readLoginMode(storage)),'owner');
  assert.deepEqual(data,{'daylight-login-mode-v1':'owner'});
  assert.equal(loginMode('/app','?signup',readLoginMode(storage)),'member');
  assert.equal(loginMode('/app','?login=member',readLoginMode(storage)),'member');
  rememberLoginMode('member',storage);assert.equal(loginMode('/owner','',readLoginMode(storage)),'owner');
  assert.equal(loginMode('/app','',readLoginMode(storage)),'member');
});
test('blocked or tampered browser preferences cannot grant authentication or break the login page',()=>{
  assert.equal(readLoginMode({getItem:()=>{throw Error('blocked');}}),null);
  assert.doesNotThrow(()=>rememberLoginMode('owner',{setItem:()=>{throw Error('blocked');}}));
  assert.equal(readLoginMode({getItem:()=> 'owner;session=fake'}),null);
});
