import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import type {AuthorIdentityAdapter,CurrentMembership,VerifiedAuthorSession} from './author-auth.ts';

/** Server-only LM-043 security boundary. No provider callback or DB credential is configured. */
const TOKEN=/^[A-Za-z0-9_-]{43}$/;
const DIGEST=/^[a-f0-9]{64}$/;
const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const SESSION_COOKIE='__Host-lm_session';
const CSRF_COOKIE='__Host-lm_csrf';
export const AUTHOR_COOKIE_NAMES={session:SESSION_COOKIE,csrf:CSRF_COOKIE} as const;
const digest=(value:string)=>createHash('sha256').update(value,'utf8').digest('hex');
function equalsDigest(a:string,b:string):boolean{
 if(!DIGEST.test(a)||!DIGEST.test(b))return false;
 return timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));
}
function readCookie(request:Request,name:string):string|null{
 const raw=request.headers.get('cookie');
 if(!raw||raw.length>8192)return null;
 let result:string|null=null;
 for(const fragment of raw.split(';')){
  const part=fragment.trim();
  const index=part.indexOf('=');
  if(index<0||part.slice(0,index)!==name)continue;
  const value=part.slice(index+1);
  if(result!==null||!TOKEN.test(value))return null;
  result=value;
 }
 return result;
}
export type GeneratedAuthorCookies={
 readonly tokenDigest:string;readonly csrfDigest:string;
 /** Set-Cookie values only. Never persist, log or return in JSON. */
 readonly sessionSetCookie:string;readonly csrfSetCookie:string;
};
export function createSessionCookiePair(maxAgeSeconds=3600):GeneratedAuthorCookies{
 if(!Number.isSafeInteger(maxAgeSeconds)||maxAgeSeconds<60||maxAgeSeconds>86400)throw Error('SESSION_TTL_INVALID');
 const token=randomBytes(32).toString('base64url');
 const csrf=randomBytes(32).toString('base64url');
 const common='; Secure; Path=/; SameSite=Lax; Max-Age='+maxAgeSeconds;
 return {
  tokenDigest:digest(token),csrfDigest:digest(csrf),
  sessionSetCookie:SESSION_COOKIE+'='+token+common+'; HttpOnly',
  csrfSetCookie:CSRF_COOKIE+'='+csrf+common
 };
}

/** Only a trusted server-side query against lm_author_sessions may produce this row. */
export type StoredAuthorSession={
 readonly id:string; readonly tokenDigest:string; readonly csrfDigest:string;
 readonly actorId:string; readonly issuedAt:number; readonly expiresAt:number;
 readonly lastReauthenticatedAt:number; readonly revokedAt:number|null;
};
export interface AuthorSessionStore {
 /** Must query indexed token_digest with server-only credentials on EVERY request. */
 lookupSession(tokenDigest:string):Promise<StoredAuthorSession|null>;
 /** Must resolve org-scoped membership from current DB state, without caching. */
 lookupMembership(actorId:string,organizationId:string):Promise<CurrentMembership|null>;
}
/**
 * Database-backed cookie adapter. Does NOT perform identity-provider login.
 * Author endpoints remain disabled until trusted issuer, issuance and RLS
 * service-role setup are configured and tested end to end.
 */
export class StoredCookieAuthorIdentityAdapter implements AuthorIdentityAdapter {
 constructor(private readonly store:AuthorSessionStore,private readonly now:()=>number=Date.now){}
 async verifySession(request:Request):Promise<VerifiedAuthorSession|null>{
  const token=readCookie(request,SESSION_COOKIE),csrf=readCookie(request,CSRF_COOKIE);
  if(!token||!csrf)return null;
  let row:StoredAuthorSession|null;
  try{row=await this.store.lookupSession(digest(token));}catch{return null;}
  const now=this.now();
  if(!row||!UUID.test(row.id)||!UUID.test(row.actorId)||!equalsDigest(row.tokenDigest,digest(token))||
     !equalsDigest(row.csrfDigest,digest(csrf))||row.revokedAt!==null||
     !Number.isSafeInteger(row.issuedAt)||!Number.isSafeInteger(row.expiresAt)||
     !Number.isSafeInteger(row.lastReauthenticatedAt)||!Number.isSafeInteger(now)||
     row.issuedAt<=0||row.issuedAt>now+30000||row.expiresAt<=now||
     row.expiresAt<=row.issuedAt||row.expiresAt-row.issuedAt>86400000||
     row.lastReauthenticatedAt<row.issuedAt||row.lastReauthenticatedAt>now+30000||
     row.lastReauthenticatedAt>row.expiresAt)return null;
  return {kind:'server-verified-identity',subject:row.actorId,sessionId:row.id,
          issuedAt:row.issuedAt,expiresAt:row.expiresAt,
          lastReauthenticatedAt:row.lastReauthenticatedAt,csrfToken:csrf};
 }
 async currentMembership(subject:string,organizationId:string):Promise<CurrentMembership|null>{
  if(!UUID.test(subject)||!UUID.test(organizationId))return null;
  try{
   const member=await this.store.lookupMembership(subject,organizationId);
   if(!member||member.subject!==subject||member.organizationId!==organizationId)return null;
   return member;
  }catch{return null;}
 }
}
