import {describe,it,expect} from 'vitest';
import {PostgresAuthorSessionStore,type AuthorSessionDatabase} from '../../apps/web/app/lib/author-postgres-session-store.ts';
import {createSessionCookiePair,StoredCookieAuthorIdentityAdapter} from '../../apps/web/app/lib/author-cookie-session.ts';
import {authorizeAuthorAction} from '../../apps/web/app/lib/author-auth.ts';
const actor='11111111-1111-4111-8111-111111111111',org='22222222-2222-4222-8222-222222222222',session='33333333-3333-4333-8333-333333333333';
const stamp=new Date(1800000000000);
const sessionRow={id:session,actor_id:actor,token_digest:'a'.repeat(64),csrf_digest:'b'.repeat(64),
 issued_at:stamp,expires_at:new Date(stamp.getTime()+3600000),last_reauthenticated_at:stamp,revoked_at:null};
const memberRow={org_id:org,actor_id:actor,role:'publisher',membership_revision:'7',revoked_at:null};

describe('LM-043 PostgreSQL session and membership store',()=>{
 it('reads each token and scoped member fresh and maps publisher authority without invented roles',async()=>{
  let sessions=0,members=0;
  const database:AuthorSessionDatabase={queryAuth:async(_sql,parameters)=>{sessions++;expect(parameters[0]).toBe(sessionRow.token_digest);return {rows:[sessionRow]};},
   queryInOrganization:async(scope,sql,parameters)=>{members++;expect(scope).toBe(org);expect(parameters[0]).toBe(org);expect(parameters[1]).toBe(actor);expect(sql.includes('org_id=$1 AND actor_id=$2')).toBe(true);return {rows:[memberRow]};}};
  const store=new PostgresAuthorSessionStore(database);
  for(let i=0;i<2;i++){
   expect((await store.lookupSession(sessionRow.token_digest))?.actorId).toBe(actor);
   const membership=await store.lookupMembership(actor,org);
   expect(membership?.roles[0]).toBe('publisher');expect(membership?.revision).toBe(7);
  }
  expect(sessions).toBe(2);expect(members).toBe(2);
 });
 it('fails closed for revoked/mismatched/ambiguous session rows',async()=>{
  for(const rows of [[{...sessionRow,revoked_at:stamp}],[{...sessionRow,token_digest:'c'.repeat(64)}],
   [{...sessionRow,issued_at:'not-a-time'}],[sessionRow,sessionRow]]){
   const store=new PostgresAuthorSessionStore({queryAuth:async()=>({rows}),queryInOrganization:async()=>({rows:[]})});
   expect(await store.lookupSession(sessionRow.token_digest)).toBeNull();
  }
 });
 it('rejects cross-organization identity/role/revision data and exposes fresh revocation',async()=>{
  for(const row of [{...memberRow,org_id:actor},{...memberRow,actor_id:org},
   {...memberRow,role:'admin'},{...memberRow,membership_revision:'9007199254740992'}]){
   const store=new PostgresAuthorSessionStore({queryAuth:async()=>({rows:[]}),queryInOrganization:async()=>({rows:[row]})});
   expect(await store.lookupMembership(actor,org)).toBeNull();
  }
  const store=new PostgresAuthorSessionStore({queryAuth:async()=>({rows:[]}),queryInOrganization:async()=>({rows:[{...memberRow,revoked_at:stamp}]})});
  expect((await store.lookupMembership(actor,org))?.revokedAt).toBe(stamp.getTime());
 });
 it('revokes only the authenticated actor/session pair and reports storage failure honestly',async()=>{
  const database:AuthorSessionDatabase={queryAuth:async(sql,parameters)=>{
   expect(sql.includes('id=$1 AND actor_id=$2')).toBe(true);expect(parameters[0]).toBe(session);expect(parameters[1]).toBe(actor);
   return {rows:[{id:session}]};},queryInOrganization:async()=>({rows:[]})};
  expect(await new PostgresAuthorSessionStore(database).revokeSession(session,actor)).toBe(true);
  const failing=new PostgresAuthorSessionStore({queryAuth:async()=>{throw Error('SECRET');},queryInOrganization:async()=>{throw Error('SECRET');}});
  expect(await failing.lookupSession(sessionRow.token_digest)).toBeNull();
  expect(await failing.lookupMembership(actor,org)).toBeNull();
  expect(await failing.revokeSession(session,actor)).toBe(false);
 });
 it('integrates opaque cookies with fresh membership/session revocation and tenant denial',async()=>{
  const pair=createSessionCookiePair();
  const sessionCookie=pair.sessionSetCookie.split(';')[0]!,csrfCookie=pair.csrfSetCookie.split(';')[0]!;
  const csrf=csrfCookie.slice(csrfCookie.indexOf('=')+1);
  let membershipRevoked=false,sessionRevoked=false;
  const database:AuthorSessionDatabase={queryAuth:async(sql,parameters)=>{
   if(sql.startsWith('UPDATE')){sessionRevoked=true;return {rows:[{id:session}]};}
   return {rows:sessionRevoked||parameters[0]!==pair.tokenDigest?[]:[{...sessionRow,token_digest:pair.tokenDigest,csrf_digest:pair.csrfDigest}]};
  },queryInOrganization:async(scope)=>({rows:scope===org?[{...memberRow,revoked_at:membershipRevoked?stamp:null}]:[]})};
  const store=new PostgresAuthorSessionStore(database),adapter=new StoredCookieAuthorIdentityAdapter(store,()=>stamp.getTime());
  const request=()=>new Request('https://app.example.test/api/author/'+org+'/preview',{method:'POST',headers:{
   cookie:sessionCookie+'; '+csrfCookie,origin:'https://app.example.test','x-law-machine-csrf':csrf}});
  const authorize=(organizationId=org)=>authorizeAuthorAction({request:request(),organizationId,action:'publish',adapter,now:stamp.getTime()});
  expect((await authorize()).authorized).toBe(true);
  expect((await authorize(actor)).authorized).toBe(false);
  membershipRevoked=true;
  expect((await authorize()).authorized).toBe(false);
  membershipRevoked=false;
  expect(await store.revokeSession(session,actor)).toBe(true);
  expect((await authorize()).authorized).toBe(false);
 });
});
