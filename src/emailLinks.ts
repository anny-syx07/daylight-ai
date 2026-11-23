export type EmailRun={text:string;href?:string};
export interface EmailContent {runs:EmailRun[];receivedAt?:string;previewOnly?:boolean;truncated?:boolean;}
export function safeEmailLink(value:unknown):string|undefined{
  if(typeof value!=='string'||value.length>4096)return;
  const raw=value.trim();if(/[\u0000-\u0020\u007f]/.test(raw)||/^mailto:.*%(?:0a|0d)/i.test(raw))return;
  try{const url=new URL(raw);if(url.username||url.password||!['https:','http:','mailto:'].includes(url.protocol))return;if(url.protocol==='mailto:'&&!/^[^?@]+@[^?@]+/.test(url.pathname))return;return url.href;}catch{return;}
}
export function emailTextRuns(text:string):EmailRun[]{
  const runs:EmailRun[]=[];const pattern=/(?:https?:\/\/|mailto:)[^\s<>"']+/gi;let last=0;
  for(const match of text.matchAll(pattern)){
    let raw=match[0].replace(/[.,;!?:]+$/,'');
    while(raw.endsWith(')')&&(raw.match(/\)/g)||[]).length>(raw.match(/\(/g)||[]).length)raw=raw.slice(0,-1);
    const href=safeEmailLink(raw);if(!href)continue;
    if(match.index!>last)runs.push({text:text.slice(last,match.index)});runs.push({text:raw,href});last=match.index!+raw.length;
  }
  if(last<text.length)runs.push({text:text.slice(last)});return runs.length?runs:[{text}];
}
