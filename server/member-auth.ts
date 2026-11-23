import { createHash, createHmac } from 'node:crypto';
import type { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import { createAuthServer, extractNeonAuthCookies, handleAuthProxyRequest, resolveNeonAuthLogging, serializeSetCookie, parseCookieValue, NEON_AUTH_SESSION_COOKIE_NAME } from '@neon/auth/server';
import { get, set, update, remove, inWorkspace } from './store.js';
import { origin } from './connectors.js';

const baseUrl=process.env.NEON_AUTH_BASE_URL || '';
export const memberAuthReady=Boolean(baseUrl && process.env.ENCRYPTION_KEY);
const cookieSecret=createHmac('sha256',process.env.ENCRYPTION_KEY || 'local-development-only').update('daylight-member-cookie-v1').digest('hex');
const log=resolveNeonAuthLogging({logLevel:'silent'});
export const memberWorkspace = (id: string) => `u_${createHash('sha256').update(id).digest('hex')}`;
const tokenHash=(cookies:string)=>createHash('sha256').update(cookies).digest('hex');
export const hasMemberCookie=(request:ExpressRequest)=>Boolean(parseCookieValue(request.headers.cookie || '',NEON_AUTH_SESSION_COOKIE_NAME));
export function clearMemberCookies(request:ExpressRequest,response:ExpressResponse) { for(const cookie of extractNeonAuthCookies(request.headers.cookie || '').split(';')) { const name=cookie.trim().split('=')[0];if(name)response.clearCookie(name,{path:'/',secure:true,sameSite:'lax',httpOnly:true}); } }

export async function memberIdentity(request: ExpressRequest,response: ExpressResponse) {
  if(!memberAuthReady) return null;
  const cookies=extractNeonAuthCookies(request.headers.cookie || '');
  const primary=parseCookieValue(cookies,NEON_AUTH_SESSION_COOKIE_NAME);
  if(!primary || await inWorkspace('owner',()=>get(`auth:revoked:${tokenHash(primary)}`,false))) return null;
  const auth=createAuthServer({baseUrl,cookieSecret,sessionDataTtl:30,sameSite:'lax',log,context:()=>({
    getCookies:()=>cookies,getHeader:(name)=>request.get(name)||null,getOrigin:()=>origin,getFramework:()=> 'express',
    setCookie:(name,value,options)=>{response.append('Set-Cookie',serializeSetCookie({name,value,...options}));},
  })});
  const result=await auth.getSession();
  if(result.error){if([401,403].includes(result.error.status))return null;throw Error('Authentication service temporarily unavailable');}
  const user=result.data?.user;
  if(!user?.id || !user.emailVerified) return null;
  return {workspace:memberWorkspace(user.id),name:user.name || 'Bạn',email:user.email,kind:'member' as const};
}
export async function revokeMemberSession(request: ExpressRequest) {
  const cookies=extractNeonAuthCookies(request.headers.cookie || '');
  const primary=parseCookieValue(cookies,NEON_AUTH_SESSION_COOKIE_NAME);
  if(primary) await inWorkspace('owner',()=>set(`auth:revoked:${tokenHash(primary)}`,true));
}
export async function memberAuthProxy(request: ExpressRequest,response: ExpressResponse) {
  if(!memberAuthReady){response.status(503).json({error:'Đăng ký đang được chuẩn bị. Vui lòng quay lại sau.'});return;}
  const path=request.path.replace(/^\/api\/auth\//,'');
  if(!['sign-in/email','sign-up/email','sign-out','get-session','email-otp/send-verification-otp','email-otp/verify-email','email-otp/reset-password'].includes(path)){response.sendStatus(404);return;}
  if(path==='sign-up/email'||path==='email-otp/reset-password'){
    let body;try{body=Buffer.isBuffer(request.body)?JSON.parse(request.body.toString('utf8')):request.body;}catch{response.sendStatus(400);return;}
    if(typeof body?.password!=='string'||body.password.length<12||body.password.length>128){response.status(400).json({code:'PASSWORD_TOO_SHORT',message:'Mật khẩu cần 12–128 ký tự.'});return;}
  }
  const ip=String(request.headers['x-forwarded-for'] || request.socket.remoteAddress || 'unknown').split(',')[0].trim();
  if(request.method!=='GET'){
    const bucket=await inWorkspace('owner',()=>update(`auth:rate:${tokenHash(ip)}`,{count:0,reset:0},s=>s.reset<Date.now()?{count:1,reset:Date.now()+3600000}:{...s,count:s.count+1}));
    if(bucket.count>120){response.status(429).json({error:'Đã thử nhiều lần. Vui lòng chờ rồi thử lại.'});return;}
  }
  if(path==='sign-out') await revokeMemberSession(request);
  const headers=new Headers({Origin:origin,Accept:'application/json','Content-Type':'application/json'});
  const cookies=extractNeonAuthCookies(request.headers.cookie || '');if(cookies)headers.set('Cookie',cookies);
  headers.set('X-Forwarded-For',ip);
  const init:RequestInit & {duplex?:'half'}={method:request.method,headers,...(!['GET','HEAD'].includes(request.method)?{body:Buffer.isBuffer(request.body)?request.body.toString('utf8'):JSON.stringify(request.body || {}),duplex:'half' as const}:{})};
  const webRequest=new Request(origin+request.originalUrl,init);
  const result=await handleAuthProxyRequest({request:webRequest,path,baseUrl,cookieSecret,sessionDataTtl:30,sameSite:'lax',log});
  for(const cookie of result.headers.getSetCookie()) response.append('Set-Cookie',cookie);
  for(const name of ['location','set-auth-jwt','retry-after']){const value=result.headers.get(name);if(value)response.set(name,value);}
  response.status(result.status).type(result.headers.get('content-type') || 'application/json').send(await result.text());
}

export async function registerBridge(provider:'gmail'|'sis',key:string,owner:string) {
  await inWorkspace('owner',()=>set(`bridge:${provider}:${tokenHash(key)}`,owner));
}
export async function unregisterBridge(provider:'gmail'|'sis',key:string) {
  await inWorkspace('owner',()=>remove(`bridge:${provider}:${tokenHash(key)}`));
}
export async function bridgeWorkspace(provider:'gmail'|'sis',header?:string) {
  const match=header?.match(/^Bearer ([a-f0-9]{64})$/);
  if(!match) return 'owner';
  return inWorkspace('owner',()=>get<string>(`bridge:${provider}:${tokenHash(match[1])}`,'owner'));
}
