export type LoginMode='owner'|'member';
const key='daylight-login-mode-v1';
export function requestedLoginMode(path:string,search:string):LoginMode|null{
  if(path==='/owner')return 'owner';
  const query=new URLSearchParams(search);
  return query.has('signup')||query.get('login')==='member'?'member':null;
}
export function readLoginMode(storage?:Pick<Storage,'getItem'>):LoginMode|null{
  try{const target=storage||(typeof window!=='undefined'?window.localStorage:null);const value=target?.getItem(key);return value==='owner'||value==='member'?value:null;}catch{return null;}
}
export function rememberLoginMode(mode:LoginMode,storage?:Pick<Storage,'setItem'>){try{const target=storage||(typeof window!=='undefined'?window.localStorage:null);target?.setItem(key,mode);}catch{}}
export function loginMode(path:string,search:string,remembered:LoginMode|null){return requestedLoginMode(path,search)||remembered||'member';}
