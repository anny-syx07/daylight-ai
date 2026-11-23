export function createApi(fetcher:typeof fetch=fetch,onSignedOut:()=>void=()=>window.dispatchEvent(new Event('signedout'))){
  return async function api<T=any>(path:string,method='GET',body?:unknown):Promise<T>{
    const options:RequestInit={method,credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{})};
    let response=await fetcher(`/api${path}`,options);
    if(response.status===401&&!['/login','/session'].includes(path)){
      // A provider cold start or dropped request must not erase a valid login.
      let session:Response;try{session=await fetcher('/api/session',{credentials:'same-origin',cache:'no-store'});}catch{throw Error('Kết nối đang gián đoạn. Phiên đăng nhập của bạn vẫn được giữ.');}
      if(!session.ok)throw Error('Chưa kiểm tra được phiên đăng nhập. App sẽ thử lại khi có kết nối.');
      const state=await session.json();
      if(state.authenticated===false){onSignedOut();throw Error('Phiên đã kết thúc. Bạn đăng nhập lại nhé.');}
      if(state.authenticated!==true)throw Error('Chưa kiểm tra được phiên đăng nhập. Hãy thử lại.');
      response=await fetcher(`/api${path}`,options);
    }
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(data.error||'Chưa thực hiện được. Hãy thử lại nhé.');return data;
  };
}
