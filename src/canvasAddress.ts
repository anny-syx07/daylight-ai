export const LEGACY_CANVAS_ORIGIN = 'https://umthcm.instructure.com';
/** Syntax only. The server also validates DNS at the actual socket connection. */
export function normalizeCanvasAddress(value: unknown): string {
  if(typeof value!=='string'||!value.trim()||value.length>2048)throw Error('Nhập địa chỉ Canvas của trường bạn.');
  const raw=value.trim();
  let url:URL;try{url=new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(raw)?raw:`https://${raw}`);}catch{throw Error('Địa chỉ Canvas chưa đúng. Ví dụ: https://truong.instructure.com');}
  const host=url.hostname.toLowerCase();
  if(url.protocol!=='https:'||url.username||url.password||url.port||!host.includes('.')||host.endsWith('.')||host.length>253||!host.split('.').every(label=>/^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i.test(label))||!/[a-z]/i.test(host.split('.').at(-1)!)||/(^|\.)(localhost|local|internal|intranet|test|invalid|example|onion|home|lan|arpa)$/.test(host))throw Error('Dùng tên miền Canvas công khai của trường qua HTTPS, không dùng địa chỉ IP hoặc mạng nội bộ.');
  return url.origin;
}
export function canvasSettingsLink(value:unknown){try{return `${normalizeCanvasAddress(value)}/profile/settings`;}catch{return null;}}
