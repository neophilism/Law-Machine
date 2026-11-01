import {StoredCookieAuthorIdentityAdapter,type AuthorSessionStore} from './author-cookie-session.ts';
export interface RevocableAuthorSessionStore extends AuthorSessionStore{
 revokeSession(sessionId:string,actorId:string):Promise<boolean>;
}
const clearCookies=[
 '__Host-lm_session=; Secure; HttpOnly; Path=/; SameSite=Lax; Max-Age=0',
 '__Host-lm_csrf=; Secure; Path=/; SameSite=Lax; Max-Age=0',
];
/** Prepared server handler, not mounted publicly. Requires a trusted restricted store. */
export function createAuthorLogoutHandler(store:RevocableAuthorSessionStore,expectedOrigin:string,now:()=>number=Date.now){
 const configured=new URL(expectedOrigin);
 if(configured.protocol!=='https:'||expectedOrigin!==configured.origin)throw Error('AUTHOR_ORIGIN_INVALID');
 const identity=new StoredCookieAuthorIdentityAdapter(store,now);
 return async(request:Request):Promise<Response>=>{
  const headers=new Headers({'cache-control':'no-store','content-type':'application/json'});
  if(request.method!=='POST')return new Response(JSON.stringify({error:'METHOD_NOT_ALLOWED'}),{status:405,headers:{...Object.fromEntries(headers),allow:'POST'}});
  if(new URL(request.url).origin!==expectedOrigin||request.headers.get('origin')!==expectedOrigin)
   return new Response(JSON.stringify({error:'CSRF_INVALID'}),{status:403,headers});
  const session=await identity.verifySession(request);
  if(!session)return new Response(JSON.stringify({error:'AUTH_REQUIRED'}),{status:401,headers});
  if(request.headers.get('x-law-machine-csrf')!==session.csrfToken)
   return new Response(JSON.stringify({error:'CSRF_INVALID'}),{status:403,headers});
  let revoked=false;
  try{revoked=await store.revokeSession(session.sessionId,session.subject);}catch{/* fail closed */}
  if(!revoked)return new Response(JSON.stringify({error:'SESSION_REVOCATION_UNAVAILABLE'}),{status:503,headers});
  for(const cookie of clearCookies)headers.append('set-cookie',cookie);
  return new Response(null,{status:204,headers});
 };
}
