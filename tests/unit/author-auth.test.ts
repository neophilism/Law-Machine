import {describe,it,expect} from 'vitest';
import {
 authorizeAuthorAction,DisabledAuthorIdentityAdapter,FixtureAuthorIdentityAdapter,
 type VerifiedAuthorSession,type CurrentMembership
} from '../../apps/web/app/lib/author-auth.ts';
const org='11111111-1111-4111-8111-111111111111';
const outsider='22222222-2222-4222-8222-222222222222';
const now=1_765_000_000_000;
const csrf='c'.repeat(48);
const session:VerifiedAuthorSession={
 kind:'server-verified-identity',subject:'user-1',sessionId:'opaque-session',
 issuedAt:now-60_000,expiresAt:now+3600_000,
 lastReauthenticatedAt:now-60_000,csrfToken:csrf
};
const membership:CurrentMembership={
 organizationId:org,subject:'user-1',roles:['publisher'],revision:1,revokedAt:null
};
const request=(method='GET',origin='https://example.test',token=csrf)=>new Request(
 'https://example.test/api/author/'+org+'/preview',
 {method,headers:{origin,'x-law-machine-csrf':token}}
);
describe('LM-043 author-access foundation',()=>{
 it('denies anonymous users without an identity-provider session',async()=>{
  const a=new DisabledAuthorIdentityAdapter();
  expect(await authorizeAuthorAction({request:request(),organizationId:org,action:'view',adapter:a,now}))
    .toEqual({authorized:false,code:'AUTH_REQUIRED'});
 });
 it('requires fresh live membership for each operation, including after revocation',async()=>{
  const a=new FixtureAuthorIdentityAdapter();a.session=session;
  a.memberships.set('user-1|'+org,membership);
  const valid=await authorizeAuthorAction({request:request(),organizationId:org,action:'publish',adapter:a,now});
  expect(valid.authorized).toBe(true);
  a.memberships.set('user-1|'+org,{...membership,revokedAt:now});
  const revoked=await authorizeAuthorAction({request:request(),organizationId:org,action:'publish',adapter:a,now});
  expect(revoked).toEqual({authorized:false,code:'ORG_ACCESS_DENIED'});
 });
 it('rejects cross-organization and insufficient-role requests',async()=>{
  const a=new FixtureAuthorIdentityAdapter();a.session=session;
  a.memberships.set('user-1|'+org,{...membership,roles:['contributor']});
  expect((await authorizeAuthorAction({request:request(),organizationId:org,action:'publish',adapter:a,now})))
    .toEqual({authorized:false,code:'ORG_ACCESS_DENIED'});
  expect((await authorizeAuthorAction({request:request(),organizationId:outsider,action:'view',adapter:a,now})))
    .toEqual({authorized:false,code:'MEMBERSHIP_REQUIRED'});
 });
 it('requires reauthentication freshness for publishing and valid session expiration',async()=>{
  const a=new FixtureAuthorIdentityAdapter();
  a.memberships.set('user-1|'+org,membership);
  a.session={...session,lastReauthenticatedAt:now-16*60_000};
  expect(await authorizeAuthorAction({request:request(),organizationId:org,action:'publish',adapter:a,now}))
    .toEqual({authorized:false,code:'REAUTH_REQUIRED'});
  a.session={...session,expiresAt:now-1};
  expect(await authorizeAuthorAction({request:request(),organizationId:org,action:'view',adapter:a,now}))
    .toEqual({authorized:false,code:'SESSION_EXPIRED'});
 });
 it('rejects session reauthentication timestamps outside session bounds',async()=>{
  const a=new FixtureAuthorIdentityAdapter();
  a.memberships.set('user-1|'+org,membership);
  a.session={...session,lastReauthenticatedAt:session.issuedAt-1};
  expect(await authorizeAuthorAction({request:request(),organizationId:org,action:'publish',adapter:a,now}))
    .toEqual({authorized:false,code:'SESSION_INVALID'});
  a.session={...session,expiresAt:now+1,lastReauthenticatedAt:now+2};
  expect(await authorizeAuthorAction({request:request(),organizationId:org,action:'publish',adapter:a,now}))
    .toEqual({authorized:false,code:'SESSION_INVALID'});
 });
 it('validates Origin and CSRF tokens on unsafe methods',async()=>{
  const a=new FixtureAuthorIdentityAdapter();a.session=session;
  a.memberships.set('user-1|'+org,membership);
  expect(await authorizeAuthorAction({request:request('POST','https://attacker.test'),organizationId:org,action:'edit',adapter:a,now}))
    .toEqual({authorized:false,code:'CSRF_INVALID'});
  expect(await authorizeAuthorAction({request:request('POST','https://example.test','bad'),organizationId:org,action:'edit',adapter:a,now}))
    .toEqual({authorized:false,code:'CSRF_INVALID'});
  expect((await authorizeAuthorAction({request:request('POST'),organizationId:org,action:'edit',adapter:a,now})).authorized)
    .toBe(true);
 });
});
