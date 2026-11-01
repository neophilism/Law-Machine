import {describe,it,expect} from 'vitest';
import {authorizeAuthorAction,type CurrentMembership} from '../../apps/web/app/lib/author-auth.ts';
import {createSessionCookiePair,StoredCookieAuthorIdentityAdapter,type StoredAuthorSession,type AuthorSessionStore} from '../../apps/web/app/lib/author-cookie-session.ts';

const org='11111111-1111-4111-8111-111111111111';
const other='22222222-2222-4222-8222-222222222222';
const actor='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const now=1_766_500_000_000;
const newContext=()=>{
 const credentials=createSessionCookiePair();
 const raw=credentials.sessionSetCookie.split(';')[0]!+'; '+credentials.csrfSetCookie.split(';')[0]!;
 const csrf=credentials.csrfSetCookie.split(';')[0]!.split('=')[1]!;
 const row:StoredAuthorSession={id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  tokenDigest:credentials.tokenDigest,csrfDigest:credentials.csrfDigest,actorId:actor,
  issuedAt:now-60_000,expiresAt:now+3600_000,lastReauthenticatedAt:now-60_000,revokedAt:null};
 let current:CurrentMembership={organizationId:org,subject:actor,roles:['publisher'],revision:1,revokedAt:null};
 const store:AuthorSessionStore={
  async lookupSession(digest){return digest===row.tokenDigest?row:null;},
  async lookupMembership(id,organizationId){return id===actor&&organizationId===org?current:null;}
 };
 const adapter=new StoredCookieAuthorIdentityAdapter(store,()=>now);
 const request=(method='GET',cookie=raw,origin='https://law.test',csrfHeader=csrf)=>
  new Request('https://law.test/api/author/'+org+'/preview',{method,
   headers:{cookie,origin,'x-law-machine-csrf':csrfHeader}});
 return {credentials,raw,csrf,row,adapter,request,changeMember:(m:CurrentMembership)=>{current=m;}};
};
describe('LM-043 opaque cookies and fresh database authorization',()=>{
 it('issues distinct high-entropy host-only cookies without storing raw secrets in hashes',()=>{
  const x=createSessionCookiePair();
  const y=createSessionCookiePair();
  expect(x.tokenDigest).toMatch(/^[a-f0-9]{64}$/);
  expect(x.csrfDigest).toMatch(/^[a-f0-9]{64}$/);
  expect(x.tokenDigest).not.toBe(y.tokenDigest);
  expect(x.sessionSetCookie).toMatch(/^__Host-lm_session=[A-Za-z0-9_-]{43}; Secure; Path=\/; SameSite=Lax; Max-Age=3600; HttpOnly$/);
  expect(x.csrfSetCookie).toMatch(/^__Host-lm_csrf=[A-Za-z0-9_-]{43}; Secure; Path=\/; SameSite=Lax; Max-Age=3600$/);
  expect(x.sessionSetCookie).not.toContain('Domain=');
  expect(x.tokenDigest).not.toContain(x.sessionSetCookie.split('=')[1]!.split(';')[0]!);
  expect(()=>createSessionCookiePair(86401)).toThrow('SESSION_TTL_INVALID');
 });
 it('authenticates only exact live session + CSRF cookie and fresh membership',async()=>{
  const x=newContext();
  const proof=await x.adapter.verifySession(x.request());
  expect(proof?.subject).toBe(actor);
  expect(proof?.sessionId).toBe(x.row.id);
  expect((await authorizeAuthorAction({request:x.request('POST'),organizationId:org,action:'publish',adapter:x.adapter,now})).authorized).toBe(true);
  expect(await authorizeAuthorAction({request:x.request('POST'),organizationId:other,action:'publish',adapter:x.adapter,now}))
   .toEqual({authorized:false,code:'MEMBERSHIP_REQUIRED'});
 });
 it('enforces immediate session revocation and expiry without stale caching',async()=>{
  const x=newContext();
  expect(await x.adapter.verifySession(x.request())).not.toBeNull();
  (x.row as {revokedAt:number|null}).revokedAt=now;
  expect(await x.adapter.verifySession(x.request())).toBeNull();
  (x.row as {revokedAt:number|null}).revokedAt=null;
  (x.row as {expiresAt:number}).expiresAt=now-1;
  expect(await x.adapter.verifySession(x.request())).toBeNull();
 });
 it('requires current organization roles on each action including after revocation',async()=>{
  const x=newContext();
  expect((await authorizeAuthorAction({request:x.request(),organizationId:org,action:'publish',adapter:x.adapter,now})).authorized).toBe(true);
  x.changeMember({organizationId:org,subject:actor,roles:['contributor'],revision:2,revokedAt:null});
  expect((await authorizeAuthorAction({request:x.request(),organizationId:org,action:'publish',adapter:x.adapter,now})).authorized).toBe(false);
  x.changeMember({organizationId:org,subject:actor,roles:['publisher'],revision:3,revokedAt:now});
  expect(await authorizeAuthorAction({request:x.request(),organizationId:org,action:'publish',adapter:x.adapter,now}))
   .toEqual({authorized:false,code:'ORG_ACCESS_DENIED'});
 });
 it('rejects forged, duplicated or oversized cookies, and CSRF spoofing',async()=>{
  const x=newContext();
  const otherCookie=createSessionCookiePair().sessionSetCookie.split(';')[0]!;
  expect(await x.adapter.verifySession(x.request('GET',otherCookie+'; '+x.credentials.csrfSetCookie.split(';')[0]!))).toBeNull();
  expect(await x.adapter.verifySession(x.request('GET',x.raw+'; '+x.raw))).toBeNull();
  expect(await x.adapter.verifySession(x.request('GET',x.raw+'; padding='+ 'x'.repeat(9000)))).toBeNull();
  expect(await authorizeAuthorAction({request:x.request('POST',x.raw,'https://attacker.test'),organizationId:org,action:'edit',adapter:x.adapter,now}))
   .toEqual({authorized:false,code:'CSRF_INVALID'});
  expect(await authorizeAuthorAction({request:x.request('POST',x.raw,'https://law.test','forged'),organizationId:org,action:'edit',adapter:x.adapter,now}))
   .toEqual({authorized:false,code:'CSRF_INVALID'});
 });
 it('fails closed when the identity store is unavailable or returns conflicting identity',async()=>{
  const x=newContext();
  const deadStore:AuthorSessionStore={
   async lookupSession(){throw Error('never expose datastore errors');},
   async lookupMembership(){throw Error('never expose membership errors');}
  };
  const unavailable=new StoredCookieAuthorIdentityAdapter(deadStore,()=>now);
  expect(await unavailable.verifySession(x.request())).toBeNull();
  const mismatched:AuthorSessionStore={
   async lookupSession(){return {...x.row,actorId:'not-a-uuid'};},
   async lookupMembership(){return null;}
  };
  expect(await new StoredCookieAuthorIdentityAdapter(mismatched,()=>now).verifySession(x.request())).toBeNull();
 });
 it('rejects malformed same-host Origin through persisted cookie auth',async()=>{
  const x=newContext();
  for(const origin of ['https://law.test/path','https://user:pass@law.test','https://law.test?x=1']){
   expect(await authorizeAuthorAction({request:x.request('POST',x.raw,origin),organizationId:org,action:'edit',adapter:x.adapter,now}))
    .toEqual({authorized:false,code:'CSRF_INVALID'});
  }
 });

});
