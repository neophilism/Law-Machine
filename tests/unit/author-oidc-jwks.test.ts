import {describe,it,expect} from 'vitest';
import {generateKeyPairSync,sign} from 'node:crypto';
import {TrustedOidcKeySet} from '../../apps/web/app/lib/author-oidc-jwks.ts';
const issuer='https://id.example.test/',clientId='law-machine',jwksUri=issuer+'keys';
const base=1800000000000,nonce='n'.repeat(43);
const first=generateKeyPairSync('rsa',{modulusLength:2048}),second=generateKeyPairSync('rsa',{modulusLength:2048});
const keys=(pair:typeof first,kid:string)=>({keys:[{...pair.publicKey.export({format:'jwk'}),kid,alg:'RS256',use:'sig'}]});
function token(pair:typeof first,kid:string){
 const header=Buffer.from(JSON.stringify({alg:'RS256',kid})).toString('base64url');
 const claims=Buffer.from(JSON.stringify({iss:issuer,aud:clientId,sub:'fixture-author',nonce,
  iat:base/1000,exp:base/1000+3600,auth_time:base/1000})).toString('base64url');
 const message=header+'.'+claims;
 return message+'.'+sign('RSA-SHA256',Buffer.from(message),pair.privateKey).toString('base64url');
}
const policy=(now=base)=>({issuer,clientId,expectedNonce:nonce,nowSeconds:Math.floor(now/1000)});
const json=(value:unknown)=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});

describe('LM-043 trusted JWKS retrieval and rotation',()=>{
 it('coalesces requests and verifies signed claims using only the pinned endpoint',async()=>{
  let calls=0;
  const cache=new TrustedOidcKeySet({issuer,clientId,jwksUri},async(url,init)=>{
   calls++;expect(url).toBe(jwksUri);expect(init?.redirect).toBe('error');expect(init?.credentials).toBe('omit');
   return json(keys(first,'one'));
  },()=>base);
  const results=await Promise.all([cache.verify(token(first,'one'),policy()),cache.verify(token(first,'one'),policy())]);
  expect(results.every(result=>result?.subject==='fixture-author')).toBe(true);
  expect(calls).toBe(1);
 });
 it('refreshes once for a rotated unknown kid after the bounded cooldown',async()=>{
  let calls=0,now=base;
  const cache=new TrustedOidcKeySet({issuer,clientId,jwksUri},async()=>{calls++;return json(calls===1?keys(first,'one'):keys(second,'two'));},()=>now);
  expect((await cache.verify(token(first,'one'),policy(now)))?.subject).toBe('fixture-author');
  expect(await cache.verify(token(second,'two'),policy(now))).toBeNull();
  expect(calls).toBe(1);
  now+=31000;
  const results=await Promise.all([cache.verify(token(second,'two'),policy(now)),cache.verify(token(second,'two'),policy(now))]);
  expect(results.every(Boolean)).toBe(true);expect(calls).toBe(2);
 });
 it('does not reuse stale keys during provider outage or repeatedly fetch during backoff',async()=>{
  let calls=0,now=base;
  const cache=new TrustedOidcKeySet({issuer,clientId,jwksUri},async()=>{calls++;if(calls>1)throw Error('secret provider error');return json(keys(first,'one'));},()=>now);
  expect((await cache.verify(token(first,'one'),policy(now)))?.subject).toBe('fixture-author');
  now+=301000;
  expect(await cache.verify(token(first,'one'),policy(now))).toBeNull();
  expect(await cache.verify(token(first,'one'),policy(now))).toBeNull();
  expect(calls).toBe(2);
 });
 it('rejects foreign metadata or malformed tokens without following caller URLs',async()=>{
  let failed=false;
  try{new TrustedOidcKeySet({issuer,clientId,jwksUri:'https://other.example.test/keys'},async()=>json({}));}catch{failed=true;}
  expect(failed).toBe(true);
  let calls=0;
  const cache=new TrustedOidcKeySet({issuer,clientId,jwksUri},async()=>{calls++;return json(keys(first,'one'));},()=>base);
  expect(await cache.verify('malformed',policy())).toBeNull();
  expect(await cache.verify(token(first,'one'),{...policy(),issuer:'https://other.example.test/'})).toBeNull();
  expect(calls).toBe(0);
 });
 it('bounds stalled headers/body and rejects redirected or oversized key sets',async()=>{
  let cancelled=false;
  for(const fetcher of [()=>new Promise<Response>(()=>{}),
   async()=>new Response(new ReadableStream<Uint8Array>({pull(){return new Promise(()=>{});},cancel(){cancelled=true;}}),{headers:{'content-type':'application/json'}}),
   async()=>{const response=json(keys(first,'one'));Object.defineProperty(response,'redirected',{value:true});return response;},
   async()=>new Response(' '.repeat(65537),{headers:{'content-type':'application/json'}})]){
   const cache=new TrustedOidcKeySet({issuer,clientId,jwksUri},fetcher as typeof fetch,()=>base,20);
   expect(await cache.verify(token(first,'one'),policy())).toBeNull();
  }
  expect(cancelled).toBe(true);
 });
});
