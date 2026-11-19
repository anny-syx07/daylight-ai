import { lookup } from 'node:dns/promises';
import type { LookupAddress } from 'node:dns';
import { Agent } from 'undici';
import ipaddr from 'ipaddr.js';
import { normalizeCanvasAddress } from '../src/canvasAddress.js';

export class CanvasNetworkError extends Error { code='CANVAS_ADDRESS_BLOCKED';constructor(){super('Địa chỉ Canvas không truy cập được qua Internet công khai. Kiểm tra link Canvas chính thức của trường.');} }
export function publicCanvasIp(address:string){try{return ipaddr.process(address).range()==='unicast';}catch{return false;}}
export async function canvasAddresses(hostname:string,resolve:(host:string)=>Promise<LookupAddress[]>=host=>lookup(host,{all:true,verbatim:true})){
  normalizeCanvasAddress(`https://${hostname}`);
  const addresses=await resolve(hostname);
  if(!addresses.length||addresses.some(a=>!publicCanvasIp(a.address)))throw new CanvasNetworkError();
  return addresses;
}
// DNS is validated inside the socket lookup, not in a separate preflight.
// The socket uses these exact approved addresses; DNS rebinding cannot swap in
// a private address between validation and connect. TLS hostname checks remain on.
const dispatcher=new Agent({connections:4,maxResponseSize:8*1024*1024,connect:{timeout:15000,lookup:(hostname,options,callback)=>{
  void canvasAddresses(hostname).then(addresses=>{
    const family=typeof options.family==='number'?options.family:0;
    const usable=family?addresses.filter(a=>a.family===family):addresses;
    if(!usable.length)throw new CanvasNetworkError();
    if(options.all)callback(null,usable);else callback(null,usable[0].address,usable[0].family);
  }).catch(error=>callback(error,'',4));
}}});
export const canvasFetch:typeof fetch=async(input,init)=>{
  const url=new URL(input instanceof Request?input.url:String(input));
  normalizeCanvasAddress(url.origin);
  if(url.username||url.password)throw new CanvasNetworkError();
  return fetch(input,{...init,dispatcher,redirect:'error'} as RequestInit);
};
export function canvasNetworkMessage(error:unknown):string|undefined{
  for(let current:any=error,n=0;current&&n<5;current=current.cause,n++){
    if(current.code==='CANVAS_ADDRESS_BLOCKED')return new CanvasNetworkError().message;
    if(['ENOTFOUND','EAI_AGAIN'].includes(current.code))return 'Chưa tìm thấy tên miền Canvas. Kiểm tra địa chỉ hoặc thử lại sau.';
  }
}
