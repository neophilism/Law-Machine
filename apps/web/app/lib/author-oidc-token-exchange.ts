import type {CompletedOidcCallback} from './author-oidc-pkce.ts';

async function beforeDeadline<T>(operation:Promise<T>,signal:AbortSignal):Promise<T>{
 if(signal.aborted)throw Error('OIDC_EXCHANGE_TIMEOUT');
 let abort:()=>void=()=>{};
 const interrupted=new Promise<T>((_resolve,reject)=>{
  abort=()=>reject(Error('OIDC_EXCHANGE_TIMEOUT'));
  signal.addEventListener('abort',abort,{once:true});
 });
 try{return await Promise.race([operation,interrupted]);}
 finally{signal.removeEventListener('abort',abort);}
}
/** Provider-neutral, server-only token exchange for an already consumed PKCE callback.
 * Returned ID token is untrusted until verified against independently trusted JWKS and bound nonce.
 */
export async function exchangeOidcCode(input:{
 readonly callback:CompletedOidcCallback;readonly tokenEndpoint:string;
 readonly clientId:string;readonly fetcher:typeof fetch;
 readonly timeoutMs?:number;
}):Promise<string|null>{
 let controller:AbortController|undefined;
 let timer:ReturnType<typeof setTimeout>|undefined;
 let response:Response|undefined;
 let reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
 try{
  const {callback,tokenEndpoint,clientId,fetcher}=input;
  const timeoutMs=input.timeoutMs??10000;
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>10000)return null;
  const endpoint=new URL(tokenEndpoint),issuer=new URL(callback.issuer),redirect=new URL(callback.redirectUri);
  if(endpoint.protocol!=='https:'||endpoint.origin!==issuer.origin||
     endpoint.username||endpoint.password||endpoint.search||endpoint.hash||
     endpoint.port||endpoint.toString()!==tokenEndpoint||
     redirect.protocol!=='https:'||redirect.username||redirect.password||
     redirect.search||redirect.hash||
     !/^[A-Za-z0-9._:-]{1,128}$/.test(clientId)||
     !/^[A-Za-z0-9._~+/=-]{8,2048}$/.test(callback.code)||
     !/^[A-Za-z0-9_-]{43}$/.test(callback.codeVerifier)||
     !/^[A-Za-z0-9_-]{43}$/.test(callback.nonce))return null;
  const body=new URLSearchParams({grant_type:'authorization_code',code:callback.code,
   redirect_uri:callback.redirectUri,client_id:clientId,code_verifier:callback.codeVerifier});
  controller=new AbortController();
  timer=setTimeout(()=>controller?.abort(),timeoutMs);
  response=await beforeDeadline(fetcher(endpoint.toString(),{
   method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',
    'accept':'application/json'},body:body.toString(),redirect:'error',
   cache:'no-store',credentials:'omit',signal:controller.signal
  }),controller.signal);
  if(!response.ok||response.status!==200||
     response.redirected||(response.url&&response.url!==endpoint.toString())||
     response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()!=='application/json')return null;
  const length=response.headers.get('content-length');
  if(length!==null&&(!/^\d+$/.test(length)||!Number.isSafeInteger(Number(length))||Number(length)>32768))return null;
  if(!response.body)return null;
  reader=response.body.getReader();
  const chunks:Uint8Array[]=[];
  let bytes=0;
  while(true){
   const {value,done}=await beforeDeadline(reader.read(),controller.signal);
   if(done)break;
   bytes+=value.byteLength;
   if(bytes>32768)return null;
   chunks.push(value);
  }
  const text=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks,bytes));
  const parsed:unknown=JSON.parse(text);
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))return null;
  const data=parsed as Record<string,unknown>;
  if(data.token_type!==undefined&&data.token_type!=='Bearer')return null;
  if(typeof data.id_token!=='string'||data.id_token.length<100||data.id_token.length>14000||
     !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(data.id_token))return null;
  return data.id_token;
 }catch{return null;}
 finally{
  if(timer!==undefined)clearTimeout(timer);
  controller?.abort();
  if(reader){
   void reader.cancel().catch(()=>{});
   try{reader.releaseLock();}catch{/* pending read cancelled */}
  }else if(response?.body){void response.body.cancel().catch(()=>{});}
 }
}

