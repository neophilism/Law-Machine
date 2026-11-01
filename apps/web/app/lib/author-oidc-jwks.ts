import {verifyOidcIdToken,type OidcIdentityProof,type TrustedOidcPolicy} from './author-oidc-id-token.ts';

type Keys={readonly keys:readonly Record<string,unknown>[]};
type KeyCache={readonly value:Keys;readonly expiresAt:number};
export type TrustedKeySetConfig={readonly issuer:string;readonly clientId:string;readonly jwksUri:string};
function canonicalHttps(value:string):URL{
 const url=new URL(value);
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.port||url.toString()!==value)throw Error();
 return url;
}
function kid(compact:unknown):string|null{
 try{
  if(typeof compact!=='string'||compact.length>14000)return null;
  const parts=compact.split('.');
  if(parts.length!==3||!parts[0]||parts[0].length>2048||!(/^[A-Za-z0-9_-]+$/).test(parts[0]))return null;
  const raw=Buffer.from(parts[0],'base64url');
  if(raw.toString('base64url')!==parts[0])return null;
  const header:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
  if(!header||typeof header!=='object'||Array.isArray(header))return null;
  const h=header as Record<string,unknown>;
  return h.alg==='RS256'&&typeof h.kid==='string'&&/^[A-Za-z0-9_.:-]{1,128}$/.test(h.kid)&&
   !('jku' in h)&&!('x5u' in h)&&!('crit' in h)?h.kid:null;
 }catch{return null;}
}
async function deadline<T>(operation:Promise<T>,signal:AbortSignal):Promise<T>{
 if(signal.aborted)throw Error();
 let abort:()=>void=()=>{};
 const interrupted=new Promise<T>((_resolve,reject)=>{abort=()=>reject(Error());signal.addEventListener('abort',abort,{once:true});});
 try{return await Promise.race([operation,interrupted]);}finally{signal.removeEventListener('abort',abort);}
}

/** Pinned server-owned JWKS only; never fetch URLs advertised by an ID token. */
export class TrustedOidcKeySet{
 private cache:KeyCache|null=null;
 private inFlight:Promise<Keys|null>|null=null;
 private nextAttempt=0;
 private readonly config:TrustedKeySetConfig;
 constructor(config:TrustedKeySetConfig,private readonly fetcher:typeof fetch,
  private readonly clock:()=>number=Date.now,private readonly timeoutMs=10000){
  try{
   const issuer=canonicalHttps(config.issuer),keys=canonicalHttps(config.jwksUri);
   if(issuer.origin!==keys.origin||!/^[A-Za-z0-9._:-]{1,128}$/.test(config.clientId)||
      !Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>10000)throw Error();
   this.config=Object.freeze({...config});
  }catch{throw Error('OIDC_JWKS_CONFIG_INVALID');}
 }
 private async refresh():Promise<Keys|null>{
  if(this.inFlight)return this.inFlight;
  if(this.clock()<this.nextAttempt)return null;
  this.nextAttempt=this.clock()+30000;
  const pending=this.fetchKeys();
  this.inFlight=pending;
  try{return await pending;}finally{if(this.inFlight===pending)this.inFlight=null;}
 }
 private async fetchKeys():Promise<Keys|null>{
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),this.timeoutMs);
  let response:Response|undefined,reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
  try{
   response=await deadline(this.fetcher(this.config.jwksUri,{method:'GET',headers:{accept:'application/json'},
    redirect:'error',credentials:'omit',cache:'no-store',signal:controller.signal}),controller.signal);
   if(response.status!==200||response.redirected||(response.url&&response.url!==this.config.jwksUri)||
      response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()!=='application/json')throw Error();
   const length=response.headers.get('content-length');
   if(length!==null&&(!/^\d+$/.test(length)||!Number.isSafeInteger(Number(length))||Number(length)>65536))throw Error();
   if(!response.body)throw Error();
   reader=response.body.getReader();
   const chunks:Uint8Array[]=[];let bytes=0;
   while(true){const {done,value}=await deadline(reader.read(),controller.signal);if(done)break;
    bytes+=value.byteLength;if(bytes>65536)throw Error();chunks.push(value);}
   const value:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks,bytes)));
   if(!value||typeof value!=='object'||Array.isArray(value))throw Error();
   const keys=(value as Record<string,unknown>).keys;
   if(!Array.isArray(keys)||keys.length<1||keys.length>24||keys.some(key=>!key||typeof key!=='object'||Array.isArray(key)))throw Error();
   const result:Keys={keys:keys as Record<string,unknown>[]};
   this.cache={value:result,expiresAt:this.clock()+300000};
   return result;
  }catch{this.cache=null;return null;}
  finally{clearTimeout(timer);controller.abort();
   if(reader){void reader.cancel().catch(()=>{});try{reader.releaseLock();}catch{/* pending read cancelled */}}
   else if(response?.body){void response.body.cancel().catch(()=>{});}}
 }
 async verify(compact:unknown,policy:TrustedOidcPolicy):Promise<OidcIdentityProof|null>{
  try{
   const keyId=kid(compact);
   if(!keyId||policy.issuer!==this.config.issuer||policy.clientId!==this.config.clientId)return null;
   let keys=this.cache&&this.cache.expiresAt>this.clock()?this.cache.value:await this.refresh();
   if(!keys)return null;
   if(!keys.keys.some(key=>key.kid===keyId))keys=await this.refresh();
   return keys?verifyOidcIdToken(compact,keys,policy):null;
  }catch{return null;}
 }
}
