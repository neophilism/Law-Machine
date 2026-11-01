import {describe,it,expect} from 'vitest';
import {createAuthorLogoutHandler,type RevocableAuthorSessionStore} from '../../apps/web/app/lib/author-logout.ts';
import {createSessionCookiePair} from '../../apps/web/app/lib/author-cookie-session.ts';
const now=1800000000000;
function fixture(){
 const cookies=createSessionCookiePair(),actor='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222';
 const csrf=cookies.csrfSetCookie.split(';')[0]!.split('=')[1]!;
 let revoked=false,calls=0,fail=false;
 const store:RevocableAuthorSessionStore={lookupSession:async()=>revoked?null:{id,actorId:actor,
  tokenDigest:cookies.tokenDigest,csrfDigest:cookies.csrfDigest,issuedAt:now,expiresAt:now+3600000,lastReauthenticatedAt:now,revokedAt:null},
  lookupMembership:async()=>null,revokeSession:async(sessionId,actorId)=>{calls++;expect(sessionId).toBe(id);expect(actorId).toBe(actor);
   if(fail)return false;revoked=true;return true;}};
 const handler=createAuthorLogoutHandler(store,'https://app.example.test',()=>now);
 const request=(origin='https://app.example.test',csrfValue=csrf,method='POST')=>new Request('https://app.example.test/logout',{method,
  headers:{origin,'x-law-machine-csrf':csrfValue,cookie:cookies.sessionSetCookie.split(';')[0]+'; '+cookies.csrfSetCookie.split(';')[0]}});
 return {handler,request,calls:()=>calls,store,fail:()=>{fail=true;}};
}
describe('LM-043 prepared logout handler',()=>{
 it('revokes the authenticated session before clearing both host cookies',async()=>{
  const f=fixture(),response=await f.handler(f.request());
  expect(response.status).toBe(204);expect(f.calls()).toBe(1);
  expect(response.headers.getSetCookie().length).toBe(2);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect((await f.handler(f.request())).status).toBe(401);
 });
 it('rejects cross-origin, malformed origin, wrong CSRF and unsafe method before revocation',async()=>{
  const f=fixture();
  for(const request of [f.request('https://other.example.test'),f.request('https://app.example.test/path'),
   f.request('https://app.example.test','wrong-csrf'),f.request('https://app.example.test','wrong-csrf','GET')]){
   const response=await f.handler(request);expect(response.status===403||response.status===405).toBe(true);
   expect(response.headers.getSetCookie().length).toBe(0);
  }
  expect(f.calls()).toBe(0);
 });
 it('denies anonymous and substituted request URLs before revocation',async()=>{
  const f=fixture();
  expect((await f.handler(new Request('https://app.example.test/logout',{method:'POST',headers:{origin:'https://app.example.test'}}))).status).toBe(401);
  const request=f.request();
  expect((await f.handler(new Request('https://other.example.test/logout',{method:'POST',headers:request.headers}))).status).toBe(403);
  expect(f.calls()).toBe(0);
 });
 it('fails closed when durable revocation throws',async()=>{
  const f=fixture();f.store.revokeSession=async()=>{throw Error('database unavailable');};
  const response=await f.handler(f.request());expect(response.status).toBe(503);
  expect(response.headers.getSetCookie().length).toBe(0);
 });
 it('reports failed persistence without claiming or presenting completed logout',async()=>{
  const f=fixture();f.fail();const response=await f.handler(f.request());
  expect(response.status).toBe(503);expect(response.headers.getSetCookie().length).toBe(0);
  expect((await response.json()).error).toBe('SESSION_REVOCATION_UNAVAILABLE');
 });
});
