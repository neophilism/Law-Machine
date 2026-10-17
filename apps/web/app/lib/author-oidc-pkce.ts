import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';

/** Server-only, provider-neutral authorization-code + PKCE callback preparation. */
const TOKEN=/^[A-Za-z0-9_-]{43}$/;
const DIGEST=/^[a-f0-9]{64}$/;
const COOKIE='__Host-lm_oidc';
const sha=(value:string)=>createHash('sha256').update(value,'utf8').digest('hex');
const fresh=()=>randomBytes(32).toString('base64url');
export type OidcLoginConfig={
 readonly issuer:string; readonly authorizationEndpoint:string;
 readonly clientId:string; readonly redirectUri:string;
};
export type PendingOidcLogin={
 readonly stateDigest:string; readonly browserDigest:string;
 readonly codeVerifier:string; readonly nonce:string;
 readonly issuer:string; readonly redirectUri:string;
 readonly issuedAtMs:number; readonly expiresAtMs:number;
};
export type StartedOidcLogin={
 readonly authorizationUrl:string; readonly setCookie:string;
 /** Trusted server-side store only: NEVER serialize this member into HTTP responses. */
 readonly pending:PendingOidcLogin;
};
export interface PendingOidcLoginStore {
 /** Must remove matching state exactly once, atomically, across all worker processes. */
 consume(stateDigest:string,browserDigest:string):Promise<PendingOidcLogin|null>;
}
export type CompletedOidcCallback={
 readonly code:string; readonly codeVerifier:string;
 readonly nonce:string; readonly issuer:string; readonly redirectUri:string;
 readonly clearCookie:string;
};
function url(value:unknown):URL|null {
 try {
  if(typeof value!=='string'||value.length<10||value.length>2048)return null;
  const parsed=new URL(value);
  if(parsed.protocol!=='https:'||!parsed.hostname||parsed.username||parsed.password||
     parsed.port||parsed.hash||parsed.search||parsed.toString()!==value)return null;
  return parsed;
 }catch{return null;}
}
function trusted(config:OidcLoginConfig):boolean {
 const issuer=url(config.issuer),auth=url(config.authorizationEndpoint),callback=url(config.redirectUri);
 return !!(issuer&&auth&&callback&&
   issuer.origin===auth.origin &&
   typeof config.clientId==='string' &&
   /^[A-Za-z0-9._:-]{1,128}$/.test(config.clientId));
}
export function beginOidcLogin(config:OidcLoginConfig, nowMs=Date.now()):StartedOidcLogin {
 if(!trusted(config)||!Number.isSafeInteger(nowMs)||nowMs<=0)throw Error('OIDC_LOGIN_CONFIG_INVALID');
 const state=fresh(),browser=fresh(),codeVerifier=fresh(),nonce=fresh();
 const challenge=createHash('sha256').update(codeVerifier,'ascii').digest('base64url');
 const authorization=new URL(config.authorizationEndpoint);
 authorization.searchParams.set('response_type','code');
 authorization.searchParams.set('client_id',config.clientId);
 authorization.searchParams.set('redirect_uri',config.redirectUri);
 authorization.searchParams.set('scope','openid');
 authorization.searchParams.set('state',state);
 authorization.searchParams.set('nonce',nonce);
 authorization.searchParams.set('code_challenge',challenge);
 authorization.searchParams.set('code_challenge_method','S256');
 return {
  authorizationUrl:authorization.toString(),
  setCookie:COOKIE+'='+browser+'; Secure; HttpOnly; Path=/; SameSite=Lax; Max-Age=600',
  pending:{
   stateDigest:sha(state),browserDigest:sha(browser),
   codeVerifier,nonce,issuer:config.issuer,redirectUri:config.redirectUri,
   issuedAtMs:nowMs,expiresAtMs:nowMs+600000
  }
 };
}
function callbackCookie(request:Request):string|null {
 const raw=request.headers.get('cookie');
 if(!raw||raw.length>8192)return null;
 let token:string|null=null;
 for(const part of raw.split(';')){
  const field=part.trim(),at=field.indexOf('=');
  if(at<0 || field.slice(0,at)!==COOKIE)continue;
  const next=field.slice(at+1);
  if(token!==null||!TOKEN.test(next))return null;
  token=next;
 }
 return token;
}
function sameDigest(left:string,right:string):boolean{
 if(!DIGEST.test(left)||!DIGEST.test(right))return false;
 return timingSafeEqual(Buffer.from(left,'hex'),Buffer.from(right,'hex'));
}
/** Single-use callback proof only. Token exchange and ID-token verification are separate steps. */
export async function consumeOidcCallback(args:{
 readonly request:Request; readonly store:PendingOidcLoginStore;
 readonly expectedRedirectUri:string; readonly expectedIssuer:string;
 readonly nowMs?:number;
}):Promise<CompletedOidcCallback|null>{
 try{
  const {request,store,expectedRedirectUri,expectedIssuer}=args;
  const now=args.nowMs??Date.now(),redirect=url(expectedRedirectUri);
  if(!request||request.method!=='GET'||!redirect||
     !url(expectedIssuer)||!Number.isSafeInteger(now)||now<=0)return null;
  const received=new URL(request.url);
  if(received.origin!==redirect.origin || received.pathname!==redirect.pathname ||
     received.hash || received.username || received.password)return null;
  const state=received.searchParams.getAll('state');
  if(state.length!==1||!TOKEN.test(state[0]!))return null;
  const keys=[...received.searchParams.keys()];
  if(keys.length>8 || keys.some(k=>!['state','code','iss','error','error_description','session_state'].includes(k)) ||
     received.searchParams.getAll('iss').length>1)return null;
  const browser=callbackCookie(request);
  if(!browser)return null;
  // Atomic consume requires the matching browser binding, so a stolen state
  // cannot consume and deny another browser's valid login transaction.
  const pending=await store.consume(sha(state[0]!),sha(browser));
  if(!pending || !sameDigest(pending.browserDigest,sha(browser)) ||
     !sameDigest(pending.stateDigest,sha(state[0]!)) ||
     pending.issuer!==expectedIssuer || pending.redirectUri!==expectedRedirectUri ||
     !TOKEN.test(pending.codeVerifier) || !TOKEN.test(pending.nonce) ||
     !Number.isSafeInteger(pending.issuedAtMs)||!Number.isSafeInteger(pending.expiresAtMs) ||
     pending.issuedAtMs>now+30000 || pending.expiresAtMs<=now ||
     pending.expiresAtMs-pending.issuedAtMs!==600000 ||
     received.searchParams.has('error') ||
     (received.searchParams.has('iss') && received.searchParams.get('iss')!==pending.issuer))return null;
  const codes=received.searchParams.getAll('code');
  if(codes.length!==1 || codes[0]!.length<8 || codes[0]!.length>2048 ||
     !/^[A-Za-z0-9._~+/=-]+$/.test(codes[0]!))return null;
  return Object.freeze({
   code:codes[0]!,codeVerifier:pending.codeVerifier,
   nonce:pending.nonce,issuer:pending.issuer,redirectUri:pending.redirectUri,
   clearCookie:COOKIE+'=; Secure; HttpOnly; Path=/; SameSite=Lax; Max-Age=0'
  });
 }catch{return null;}
}

/** Deterministic integration fixture only; NOT durable or process-safe. */
export class FixturePendingOidcStore implements PendingOidcLoginStore{
 private readonly pending=new Map<string,PendingOidcLogin>();
 add(value:PendingOidcLogin):void {this.pending.set(value.stateDigest,value);}
 async consume(digest:string,browserDigest:string):Promise<PendingOidcLogin|null>{
  const existing=this.pending.get(digest)??null;
  if(!existing || !sameDigest(existing.browserDigest,browserDigest))return null;
  this.pending.delete(digest);
  return existing;
 }
}
