import{test}from'node:test';
import assert from'node:assert/strict';
import{spawn}from'node:child_process';
import{mkdtempSync,rmSync}from'node:fs';
import{tmpdir}from'node:os';
import{join}from'node:path';
import{createHash}from'node:crypto';
import{DatabaseSync}from'node:sqlite';
import{setTimeout as delay}from'node:timers/promises';
test('active owner sessions renew at most daily and expired/revoked sessions cannot renew',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'daylight-owner-renew-'));const port=42000+Math.floor(Math.random()*10000);const origin=`http://127.0.0.1:${port}`;
  const child=spawn(process.execPath,['--import','tsx','server/index.ts'],{env:{...process.env,DATABASE_URL:'',VERCEL:'',NODE_ENV:'test',STORE_NAMESPACE:'renewal:',PORT:String(port),APP_ORIGIN:origin,APP_PASSWORD:'synthetic-renewal-password',DATA_DIR:directory,NEON_AUTH_BASE_URL:''},stdio:'ignore'});
  let db:DatabaseSync|undefined;
  try{
    let ready=false;for(let n=0;n<200;n++){try{if((await fetch(origin+'/api/health')).ok){ready=true;break;}}catch{}await delay(100);}assert.ok(ready);
    const login=()=>fetch(origin+'/api/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({password:'synthetic-renewal-password'})});
    const logged=await login();assert.equal(logged.status,200);const cookie=logged.headers.getSetCookie().find(c=>c.startsWith('daylight='))!.split(';')[0];
    const key='renewal:session:'+createHash('sha256').update(cookie.slice('daylight='.length)).digest('hex');db=new DatabaseSync(join(directory,'daylight.db'));
    db.prepare('UPDATE kv SET value=? WHERE key=?').run(JSON.stringify({expires:Date.now()+2*86400000}),key);
    const renewed=await fetch(origin+'/api/session',{headers:{Cookie:cookie}});assert.equal((await renewed.json()).authenticated,true);
    assert.match(renewed.headers.getSetCookie().join(';'),/Max-Age=604800/);assert.match(renewed.headers.getSetCookie().join(';'),/HttpOnly/);
    const stored=JSON.parse((db.prepare('SELECT value FROM kv WHERE key=?').get(key) as {value:string}).value);assert.ok(stored.expires>Date.now()+6*86400000);
    const again=await fetch(origin+'/api/session',{headers:{Cookie:cookie}});assert.equal(again.headers.getSetCookie().length,0,'avoid refreshing the cookie on every poll');
    db.prepare('UPDATE kv SET value=? WHERE key=?').run(JSON.stringify({expires:Date.now()-1000}),key);
    const expired=await fetch(origin+'/api/session',{headers:{Cookie:cookie}});assert.equal((await expired.json()).authenticated,false);assert.equal(expired.headers.getSetCookie().length,0);
    assert.equal((await fetch(origin+'/api/dashboard',{headers:{Cookie:cookie}})).status,401);
    const fresh=await login();const freshCookie=fresh.headers.getSetCookie().find(c=>c.startsWith('daylight='))!.split(';')[0];
    await fetch(origin+'/api/logout',{method:'POST',headers:{Cookie:freshCookie,Origin:origin,'Content-Type':'application/json'},body:'{}'});
    assert.equal((await (await fetch(origin+'/api/session',{headers:{Cookie:freshCookie}})).json()).authenticated,false);
  }finally{db?.close();const stopped=new Promise<void>(resolve=>child.once('exit',()=>resolve()));child.kill('SIGTERM');await stopped;rmSync(directory,{recursive:true,force:true});}
});
