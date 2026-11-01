import {describe,it,expect} from 'vitest';
import {PostgresPendingOidcStore,type PendingLoginDatabase,type PendingLoginProtector} from '../../apps/web/app/lib/author-oidc-pending-store.ts';
const now=1800000000000;
const pending={stateDigest:'a'.repeat(64),browserDigest:'b'.repeat(64),codeVerifier:'c'.repeat(43),nonce:'d'.repeat(43),
 issuer:'https://id.example.test/',redirectUri:'https://app.example.test/callback',issuedAtMs:now,expiresAtMs:now+600000};
const row=()=>({issuer:pending.issuer,redirect_uri:pending.redirectUri,encrypted_payload:new Uint8Array(48).fill(7),
 issued_at:new Date(now),expires_at:new Date(now+600000)});
const protector:PendingLoginProtector={seal:async()=>new Uint8Array(48).fill(7),open:async()=>pending};

describe('LM-043 durable pending-state adapter',()=>{
 it('persists only bounded protected payload and parameterized metadata',async()=>{
  let query='',parameters:readonly unknown[]=[];
  const database:PendingLoginDatabase={query:async(sql,values)=>{query=sql;parameters=values;return {rows:[{state_digest:pending.stateDigest}]};}};
  await new PostgresPendingOidcStore(database,protector,()=>now).save(pending);
  expect(query.includes('VALUES ($1,$2,$3,$4,$5,$6,$7)')).toBe(true);
  expect(JSON.stringify(parameters).includes(pending.nonce)).toBe(false);
  expect(JSON.stringify(parameters).includes(pending.codeVerifier)).toBe(false);
  expect(parameters[4] instanceof Uint8Array).toBe(true);
 });
 it('uses one atomic consume call and accepts at most one concurrent result',async()=>{
  let available=true;
  const sqlCalls:string[]=[];
  const database:PendingLoginDatabase={query:async(sql)=>{sqlCalls.push(sql);const rows=available?[row()]:[];available=false;return {rows};}};
  const store=new PostgresPendingOidcStore(database,protector,()=>now);
  const results=await Promise.all([store.consume(pending.stateDigest,pending.browserDigest),store.consume(pending.stateDigest,pending.browserDigest)]);
  expect(results.filter(Boolean).length).toBe(1);
  expect(sqlCalls.every(sql=>sql.includes('lm_consume_oidc_pending($1,$2)'))).toBe(true);
 });
 it('rejects mismatched decrypted binding, expired state and inconsistent DB times',async()=>{
  for(const [decrypted,stored] of [[{...pending,browserDigest:'e'.repeat(64)},row()],
   [pending,{...row(),issued_at:new Date(now-1)}],
   [{...pending,issuedAtMs:now-700000,expiresAtMs:now-100000},row()]] as const){
   const database:PendingLoginDatabase={query:async()=>({rows:[stored]})};
   const store=new PostgresPendingOidcStore(database,{...protector,open:async()=>decrypted},()=>now);
   expect(await store.consume(pending.stateDigest,pending.browserDigest)).toBeNull();
  }
 });
 it('rejects invalid state and unprotected payload before any database insertion',async()=>{
  let calls=0;
  const database:PendingLoginDatabase={query:async()=>{calls++;return {rows:[]};}};
  for(const input of [pending,{...pending,expiresAtMs:now+1}]){
   const store=new PostgresPendingOidcStore(database,{...protector,seal:async()=>new Uint8Array(1)},()=>now);
   let message='';try{await store.save(input);}catch(error){message=(error as Error).message;}
   expect(message).toBe('OIDC_PENDING_STORAGE_UNAVAILABLE');
  }
  expect(calls).toBe(0);
 });
 it('fails closed on storage or decryption errors without exposing secrets',async()=>{
  const database:PendingLoginDatabase={query:async()=>{throw Error('SECRET DATABASE CONNECTION');}};
  const store=new PostgresPendingOidcStore(database,protector,()=>now);
  expect(await store.consume(pending.stateDigest,pending.browserDigest)).toBeNull();
  let message='';try{await store.save(pending);}catch(error){message=(error as Error).message;}
  expect(message).toBe('OIDC_PENDING_STORAGE_UNAVAILABLE');
  const decryptFailure=new PostgresPendingOidcStore({query:async()=>({rows:[row()]})},
   {...protector,open:async()=>{throw Error('SECRET KEY');}},()=>now);
  expect(await decryptFailure.consume(pending.stateDigest,pending.browserDigest)).toBeNull();
 });
});
