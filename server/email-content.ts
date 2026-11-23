import {Parser} from 'htmlparser2';
import {emailTextRuns,safeEmailLink,type EmailContent,type EmailRun} from '../src/emailLinks.js';
const MAX_TEXT=18000,MAX_RUNS=350,MAX_HTML=96000;
export function formatEmail({html,text,snippet,receivedAt,truncated}:{html?:unknown;text?:unknown;snippet?:unknown;receivedAt?:unknown;truncated?:unknown}):EmailContent{
  const runs:EmailRun[]=[];let length=0,cut=Boolean(truncated);
  const add=(text:string,href?:string)=>{
    text=text.replace(/\r\n?/g,'\n').replace(/\u00a0/g,' ').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'');
    if(length>=MAX_TEXT||runs.length>=MAX_RUNS){cut=true;return;}
    if(length+text.length>MAX_TEXT){text=text.slice(0,MAX_TEXT-length);cut=true;}
    const previous=runs.at(-1);if(previous&&previous.href===href)previous.text+=text;else if(text)runs.push({text,...(href?{href}:{})});length+=text.length;
  };
  const newline=()=>{if(runs.at(-1))runs.at(-1)!.text=runs.at(-1)!.text.replace(/[ \t]+$/,'');const tail=runs.at(-1)?.text||'';if(length&&!tail.endsWith('\n\n'))add(tail.endsWith('\n')?'\n':'\n\n');};
  if(typeof html==='string'&&html.trim()){
    if(html.length>MAX_HTML)cut=true;
    const stack:{tag:string;skip:boolean;href?:string}[]=[];
    const blocks=new Set(['p','div','h1','h2','h3','h4','h5','h6','blockquote','tr','section','article','ul','ol']);
    const hidden=new Set(['script','style','head','title','iframe','object','embed','svg','canvas','noscript','template']);
    const parser=new Parser({
      onopentag(tag,attrs){
        const parent=stack.at(-1);const skip=Boolean(parent?.skip||hidden.has(tag)||'hidden'in attrs||attrs['aria-hidden']==='true'||/(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(attrs.style||''));
        const href=tag==='a'?safeEmailLink(attrs.href):parent?.href;stack.push({tag,skip,href});
        if(skip)return;if(blocks.has(tag))newline();if(tag==='br')add('\n');if(tag==='li'){newline();add('• ');}if(tag==='img'&&href)add((attrs.alt||'Mở liên kết').slice(0,140),href);
      },
      ontext(value){const context=stack.at(-1);const normalized=value.replace(/\s+/g,' ');if(!normalized.trim()&&(!length||runs.at(-1)?.text.endsWith('\n')))return;if(!context?.skip)add(normalized,context?.href);},
      onclosetag(tag){const context=stack.pop();if(!context?.skip){if(blocks.has(tag)||tag==='li')newline();if(tag==='td'||tag==='th')add('  ');}},
    },{decodeEntities:true});
    parser.write(html.slice(0,MAX_HTML));parser.end();
  }
  if(!runs.some(r=>r.text.trim())){
    const value=typeof text==='string'&&text.trim()?text:typeof snippet==='string'?snippet:'';
    for(const run of emailTextRuns(value.slice(0,MAX_TEXT)))add(run.text,run.href);
    if(value.length>MAX_TEXT)cut=true;
  }else{
    const linked=runs.flatMap(r=>r.href?[r]:emailTextRuns(r.text));runs.splice(0,runs.length,...linked.slice(0,MAX_RUNS));if(linked.length>MAX_RUNS)cut=true;
  }
  if(runs[0])runs[0].text=runs[0].text.trimStart();if(runs.at(-1))runs.at(-1)!.text=runs.at(-1)!.text.trimEnd();
  const stamp=typeof receivedAt==='string'||typeof receivedAt==='number'?new Date(Number(receivedAt)||String(receivedAt)):null;
  return {runs,previewOnly:!(typeof html==='string'&&html.trim()||typeof text==='string'&&text.trim()),...(stamp&&Number.isFinite(stamp.getTime())?{receivedAt:stamp.toISOString()}:{}),...(cut?{truncated:true}:{})};
}
