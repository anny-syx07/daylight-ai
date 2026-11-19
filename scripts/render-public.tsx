import {readFile,writeFile,mkdir} from 'node:fs/promises';
import React from 'react';
import {createServer} from 'vite';
import {renderToString} from 'react-dom/server';
const SITE='https://daylight-ai-three.vercel.app';
const template=await readFile('dist/index.html','utf8');
const vite=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'});
try{
  const {PublicPage}=await vite.ssrLoadModule('/src/PublicPages.tsx');
  const {ConnectionHelpPage}=await vite.ssrLoadModule('/src/ConnectionHelp.tsx');
  const pages=[
    {path:'/',title:'Daylight · Noti maker cho Canvas, Outlook & SIS',description:'Daylight tạo noti từ Canvas, thư Outlook qua Gmail và lịch SIS UMT. Gom deadline, buổi học, tin mới; hỗ trợ nhắc nền trên iPhone và Android.',element:<PublicPage/>},
    {path:'/huong-dan',title:'Hướng dẫn kết nối Canvas, Gmail và cài Daylight',description:'Nhập địa chỉ Canvas của trường, tạo token, kết nối Gmail và cài nhắc nền trên iPhone, Android. Làm từng bước cùng Daylight.',element:<ConnectionHelpPage/>},
    {path:'/quyen-rieng-tu',title:'Quyền riêng tư · Daylight',description:'Dữ liệu Daylight lưu, cách tách tài khoản, mã hóa token, cầu nối email và cách kiểm soát dữ liệu học tập của bạn.',element:<PublicPage legal="privacy"/>},
    {path:'/dieu-khoan',title:'Điều khoản sử dụng · Daylight',description:'Phạm vi bản dùng thử Daylight, quyền kết nối nguồn học tập và giới hạn đồng bộ, nhắc việc trên điện thoại.',element:<PublicPage legal="terms"/>},
  ];
  const escape=(s:string)=>s.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
  for(const page of pages){
    const url=SITE+(page.path==='/'?'/':page.path);
    let html=template.replace(/<div id="root">[\s\S]*<\/div>(?=\s*<\/body>)/,`<div id="root">${renderToString(page.element)}</div>`);
    if(html===template)throw Error('Public root could not be rendered');
    html=html.replace(/<title>[\s\S]*?<\/title>/,'').replace(/<meta\b[^>]*(?:name="(?:description|keywords|twitter:[^"]+)"|property="og:[^"]+")[^>]*>/g,'').replace(/<link\b[^>]*rel="canonical"[^>]*>/g,'');
    const tags=`<title>${escape(page.title)}</title><meta name="description" content="${escape(page.description)}"/><link rel="canonical" href="${url}"/><meta property="og:type" content="website"/><meta property="og:site_name" content="Daylight"/><meta property="og:locale" content="vi_VN"/><meta property="og:url" content="${url}"/><meta property="og:title" content="${escape(page.path==='/'?'Daylight · Việc học rõ hơn, lòng nhẹ hơn.':page.title)}"/><meta property="og:description" content="${escape(page.description)}"/><meta property="og:image" content="${SITE}/og-image.png"/><meta property="og:image:secure_url" content="${SITE}/og-image.png"/><meta property="og:image:type" content="image/png"/><meta property="og:image:width" content="1200"/><meta property="og:image:height" content="630"/><meta property="og:image:alt" content="Daylight · Việc học rõ hơn, lòng nhẹ hơn. Minh họa giao diện học tập trên điện thoại."/><meta name="twitter:card" content="summary_large_image"/><meta name="twitter:title" content="${escape(page.path==='/'?'Daylight · Việc học rõ hơn, lòng nhẹ hơn.':page.title)}"/><meta name="twitter:description" content="${escape(page.description)}"/><meta name="twitter:image" content="${SITE}/og-image.png"/><meta name="twitter:image:alt" content="Daylight · Việc học rõ hơn, lòng nhẹ hơn."/>`;
    html=html.replace('</head>',tags+'</head>');
    const dir=page.path==='/'?'dist':`dist${page.path}`;await mkdir(dir,{recursive:true});await writeFile(`${dir}/index.html`,html);
  }
  console.log('Rendered four public pages with complete HTML, canonical URLs and share metadata.');
}finally{await vite.close();}
