import {describe,it,expect} from 'vitest';
import {generateKeyPairSync,sign} from 'node:crypto';
import {verifyOidcIdToken,type TrustedOidcPolicy} from '../../apps/web/app/lib/author-oidc-id-token.ts';

const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const pub=publicKey.export({format:'jwk'});
const keys={keys:[{...pub,kid:'issuer-key-01',use:'sig',alg:'RS256'}]};
const now=1_795_000_000;
const policy:TrustedOidcPolicy={
 issuer:'https://identity.example.test/',clientId:'law-machine-web',
 expectedNonce:'nonce-9876543210abcdefgh',nowSeconds:now
};
const claims=()=>({
 iss:policy.issuer,aud:policy.clientId,sub:'provider-subject-1',
 nonce:policy.expectedNonce,iat:now-120,exp:now+600,auth_time:now-180
});
const encode=(obj:unknown)=>Buffer.from(JSON.stringify(obj)).toString('base64url');
const jwt=(data:Record<string,unknown>,header:Record<string,unknown>={alg:'RS256',kid:'issuer-key-01',typ:'JWT'})=>{
 const payload=encode(header)+'.'+encode(data);
 return payload+'.'+sign('RSA-SHA256',Buffer.from(payload),privateKey).toString('base64url');
};
describe('LM-043 signed issuer ID-token proof: no account or session creation',()=>{
 it('accepts a correctly signed pinned issuer, nonce, audience and recent reauth',()=>{
  const proof=verifyOidcIdToken(jwt(claims()),keys,policy);
  expect(proof).toEqual({
    issuer:policy.issuer,subject:'provider-subject-1',
    issuedAtSeconds:now-120,expiresAtSeconds:now+600,
    lastAuthenticatedAtSeconds:now-180
  });
 });
 it('rejects unsigned tokens and altered signed bytes',()=>{
  const valid=jwt(claims());
  const parts=valid.split('.');
  expect(verifyOidcIdToken(encode({alg:'none',kid:'issuer-key-01'})+'.'+parts[1]+'.',keys,policy)).toBeNull();
  expect(verifyOidcIdToken(parts[0]+'.'+encode({...claims(),sub:'attacker'})+'.'+parts[2],keys,policy)).toBeNull();
  expect(verifyOidcIdToken(valid.slice(0,-3)+'###',keys,policy)).toBeNull();
 });
 it('rejects wrong issuer, audience, nonce and stale or impossible times',()=>{
  const changes=[
   {iss:'https://attacker.example.test/'},{aud:'another-client'},
   {nonce:'nonce-attacker-1234567890'},{exp:now-61},
   {iat:now+100},{auth_time:now-2000},
   {nbf:now+100},{exp:now+100000}
  ];
  for(const change of changes)expect(verifyOidcIdToken(jwt({...claims(),...change}),keys,policy)).toBeNull();
 });
 it('requires explicit authorized party for multi-audience tokens',()=>{
  const multi={...claims(),aud:['other-client',policy.clientId]};
  expect(verifyOidcIdToken(jwt(multi),keys,policy)).toBeNull();
  expect(verifyOidcIdToken(jwt({...multi,azp:policy.clientId}),keys,policy)?.subject).toBe('provider-subject-1');
 });
 it('rejects unknown or repeated key IDs, remote key URLs and private JWK',()=>{
  expect(verifyOidcIdToken(jwt(claims(),{alg:'RS256',kid:'missing'}),keys,policy)).toBeNull();
  expect(verifyOidcIdToken(jwt(claims()),{keys:[keys.keys[0],keys.keys[0]]},policy)).toBeNull();
  expect(verifyOidcIdToken(jwt(claims(),{alg:'RS256',kid:'issuer-key-01',jku:'https://evil.test/key'}),keys,policy)).toBeNull();
  expect(verifyOidcIdToken(jwt(claims()),{keys:[{...keys.keys[0],d:'private'}]},policy)).toBeNull();
 });
 it('fails closed on malformed arguments and issuer configuration',()=>{
  expect(verifyOidcIdToken({},keys,policy)).toBeNull();
  expect(verifyOidcIdToken(jwt(claims()),keys,{...policy,issuer:'http://identity.example.test/'})).toBeNull();
  expect(verifyOidcIdToken(jwt(claims()),{keys:[]},policy)).toBeNull();
 });
});
