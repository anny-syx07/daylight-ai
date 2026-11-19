import { useState } from 'react';
import { createAuthClient } from '@neon/auth';
import { ArrowLeft, ArrowUpRight } from 'lucide-react';

const auth = createAuthClient(`${location.origin}/api/auth`);
type Mode = 'signin' | 'signup' | 'verify' | 'forgot' | 'reset';
const errors: Record<string,string> = {
  INVALID_EMAIL_OR_PASSWORD:'Email hoặc mật khẩu chưa đúng.', EMAIL_NOT_VERIFIED:'Hãy xác minh email trước nhé.',
  USER_ALREADY_EXISTS:'Email này đã có tài khoản. Hãy đăng nhập hoặc đặt lại mật khẩu.',
  INVALID_OTP:'Mã chưa đúng hoặc đã hết hạn. Bạn có thể gửi lại mã.', OTP_EXPIRED:'Mã đã hết hạn. Hãy gửi lại mã.',
  PASSWORD_TOO_SHORT:'Mật khẩu cần ít nhất 12 ký tự.', TOO_MANY_REQUESTS:'Đã thử nhiều lần. Chờ một chút rồi thử lại nhé.',
};
export function MemberAuth({ onSignedIn }: { onSignedIn:()=>Promise<void> }) {
  const [mode,setMode]=useState<Mode>(new URLSearchParams(location.search).has('signup')?'signup':'signin');
  const [email,setEmail]=useState(''); const [name,setName]=useState(''); const [password,setPassword]=useState(''); const [otp,setOtp]=useState('');
  const [busy,setBusy]=useState(false); const [message,setMessage]=useState(''); const [resendAt,setResendAt]=useState(0);
  const title={signin:'Chào mừng trở lại.',signup:'Một góc học tập riêng.',verify:'Kiểm tra email nhé.',forgot:'Mình bắt đầu lại nhé.',reset:'Đặt mật khẩu mới.'}[mode];
  async function run(work:()=>Promise<void>){setBusy(true);setMessage('');try{await work();}catch(e){setMessage((e as Error).message || 'Chưa kết nối được. Hãy thử lại.');}finally{setBusy(false);}}
  function check(result:{error?:{code?:string;message?:string}|null}){if(result.error)throw Error(errors[result.error.code||''] || 'Chưa thực hiện được. Kiểm tra thông tin hoặc thử lại sau nhé.');}
  async function send(type:'email-verification'|'forget-password') {if(Date.now()<resendAt)throw Error('Chờ khoảng một phút trước khi gửi lại mã nhé.');check(await auth.$fetch('/email-otp/send-verification-otp',{method:'POST',body:{email,type}}));setResendAt(Date.now()+60000);}
  async function submit(){
    if(mode==='signin'||mode==='signup') {if('serviceWorker' in navigator && 'PushManager' in window){const r=await navigator.serviceWorker.ready;await (await r.pushManager.getSubscription())?.unsubscribe();}}
    if(mode==='signup'){check(await auth.signUp.email({email,password,name}));setMode('verify');setResendAt(Date.now()+60000);setPassword('');return;}
    if(mode==='signin'){const result=await auth.signIn.email({email,password});if(result.error?.code==='EMAIL_NOT_VERIFIED'){setMode('verify');setResendAt(Date.now()+60000);setPassword('');return;}check(result);await onSignedIn();return;}
    if(mode==='verify'){check(await auth.$fetch('/email-otp/verify-email',{method:'POST',body:{email,otp}}));setOtp('');await onSignedIn();return;}
    if(mode==='forgot'){await send('forget-password');setMode('reset');setPassword('');return;}
    check(await auth.$fetch('/email-otp/reset-password',{method:'POST',body:{email,otp,password}}));setPassword('');setOtp('');setMode('signin');setMessage('Đã đặt mật khẩu mới. Bạn đăng nhập nhé.');
  }
  return <main className="public-auth"><a className="back-link" href="/"><ArrowLeft size={16}/>Daylight</a><section className="auth-card"><img src="/icon.svg" alt="" width="60"/><p className="eyebrow">A LITTLE CLARITY, EVERY DAY</p><h1>{title}</h1><p>{mode==='verify'||mode==='reset'?`Nhập mã gửi đến ${email}. Kiểm tra cả mục Spam.`:'Hôm nay, chỉ cần tiến thêm một chút.'}</p>
    <form onSubmit={e=>{e.preventDefault();void run(submit);}}>
      {mode==='signup'&&<label>Tên bạn<input autoComplete="name" maxLength={80} required value={name} onChange={e=>setName(e.target.value)}/></label>}
      {!['verify','reset'].includes(mode)&&<label>Email<input type="email" autoComplete="email" maxLength={254} required value={email} onChange={e=>setEmail(e.target.value.trim())}/></label>}
      {['verify','reset'].includes(mode)&&<label>Mã xác minh<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={otp} onChange={e=>setOtp(e.target.value.replace(/\D/g,''))}/></label>}
      {['signin','signup','reset'].includes(mode)&&<label>{mode==='reset'?'Mật khẩu mới':'Mật khẩu'}<input type="password" autoComplete={mode==='signin'?'current-password':'new-password'} minLength={mode==='signin'?1:12} maxLength={128} required value={password} onChange={e=>setPassword(e.target.value)}/>{mode!=='signin'&&<small>Ít nhất 12 ký tự.</small>}</label>}
      {mode==='signup'&&<label className="consent"><input type="checkbox" required/><span>Tôi đồng ý <a href="/dieu-khoan" target="_blank" rel="noopener noreferrer">điều khoản</a> và <a href="/quyen-rieng-tu" target="_blank" rel="noopener noreferrer">quyền riêng tư</a>.</span></label>}
      <button className="primary" disabled={busy}>{busy?'Đang xử lý…':mode==='signup'?'Tạo tài khoản':mode==='signin'?'Vào Daylight':mode==='forgot'?'Gửi mã':'Xác nhận'}<ArrowUpRight size={18}/></button>
    </form>{message&&<p role="status" className="notice">{message}</p>}
    {mode==='signin'&&<><button className="text-button" disabled={busy} onClick={()=>{setMode('forgot');setMessage('');}}>Quên mật khẩu?</button><p>Chưa có tài khoản? <button className="text-button" disabled={busy} onClick={()=>{setMode('signup');setMessage('');}}>Đăng ký miễn phí</button></p></>}
    {mode==='signup'&&<p>Đã có tài khoản? <button className="text-button" disabled={busy} onClick={()=>{setMode('signin');setMessage('');}}>Đăng nhập</button></p>}
    {['verify','reset'].includes(mode)&&<button className="text-button" disabled={busy} onClick={()=>void run(async()=>{await send(mode==='verify'?'email-verification':'forget-password');setMessage('Đã gửi lại mã.');})}>Gửi lại mã</button>}
    {!['signin','signup'].includes(mode)&&<button className="text-button" disabled={busy} onClick={()=>{setMode('signin');setOtp('');setPassword('');setMessage('');}}>Về đăng nhập</button>}
    <p className="privacy-note">Bản dùng thử miễn phí · email xác minh có thể chậm hoặc chạm giới hạn gửi.</p>
  </section></main>;
}
