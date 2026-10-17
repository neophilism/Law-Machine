import {describe,it,expect} from 'vitest';
import {createHash} from 'node:crypto';
import {beginOidcLogin,consumeOidcCallback,FixturePendingOidcStore} from '../../apps/web/app/lib/author-oidc-pkce.ts';
const config={
 issuer:'https://accounts.example.test/',authorizationEndpoint:'https://accounts.example.test/authorize',
 clientId:'law-machine-web',redirectUri:'https://law.example.test/api/author/auth/callback'
};
const now=1_760_000_000_000;
function prepared(){
 const flow=beginOidcLogin(config,now),store=new FixturePendingOidcStore();
 store.add(flow.pending);
 const url=new URL(config.redirectUri);
 url.searchParams.set('state',new URL(flow.authorizationUrl).searchParams.get('state')!);
 url.searchParams.set('code','synthetic-valid-code-ABC123456');
 const cookie=flow.setCookie.split(';')[0]!;
 const request=(u=url.toString(),c=cookie)=>new Request(u,{headers:{cookie:c}});
 return {flow,store,url,cookie,request};
}
describe('LM-043 OIDC callback PKCE and one-time browser binding',()=>{
 it('creates a strong PKCE S256 challenge, nonce, state and secure browser binding',()=>{
  const x=prepared();
  const login=new URL(x.flow.authorizationUrl);
  expect(login.searchParams.get('response_type')).toBe('code');
  expect(login.searchParams.get('scope')).toBe('openid');
  expect(login.searchParams.get('code_challenge_method')).toBe('S256');
  expect(login.searchParams.get('code_challenge')).toBe(createHash('sha256').update(x.flow.pending.codeVerifier).digest('base64url'));
  expect(x.flow.pending.nonce).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(x.flow.setCookie).toContain('; Secure; HttpOnly; Path=/; SameSite=Lax; Max-Age=600');
  expect(x.flow.setCookie).not.toContain('Domain=');
  expect(x.flow.authorizationUrl).not.toContain(x.flow.pending.codeVerifier);
  expect(beginOidcLogin(config,now).authorizationUrl).not.toBe(x.flow.authorizationUrl);
 });
 it('consumes valid browser-bound authorization response only once',async()=>{
  const x=prepared();
  const first=await consumeOidcCallback({request:x.request(),store:x.store,
   expectedRedirectUri:config.redirectUri,expectedIssuer:config.issuer,nowMs:now+3000});
  expect(first?.code).toBe('synthetic-valid-code-ABC123456');
  expect(first?.codeVerifier).toBe(x.flow.pending.codeVerifier);
  expect(first?.nonce).toBe(x.flow.pending.nonce);
  expect(first?.clearCookie).toContain('Max-Age=0');
  expect(await consumeOidcCallback({request:x.request(),store:x.store,
   expectedRedirectUri:config.redirectUri,expectedIssuer:config.issuer,nowMs:now+3000})).toBeNull();
 });
 it('refuses stolen state without bound browser cookie without consuming it',async()=>{
  const x=prepared();
  const forged=beginOidcLogin(config,now).setCookie.split(';')[0]!;
  expect(await consumeOidcCallback({request:x.request(x.url.toString(),forged),
   store:x.store,expectedRedirectUri:config.redirectUri,expectedIssuer:config.issuer,nowMs:now})).toBeNull();
  expect(await consumeOidcCallback({request:x.request(),store:x.store,
   expectedRedirectUri:config.redirectUri,expectedIssuer:config.issuer,nowMs:now})).not.toBeNull();
 });
 it('rejects duplicate parameters, cross-origin callback, issuer substitution and expiry',async()=>{
  for(const failure of ['duplicate','origin','issuer','expired','error']){
   const x=prepared(),dest=new URL(x.url);
   if(failure==='duplicate')dest.searchParams.append('state',dest.searchParams.get('state')!);
   if(failure==='origin')dest.hostname='evil.example.test';
   if(failure==='issuer')dest.searchParams.set('iss','https://evil.example.test/');
   if(failure==='error')dest.searchParams.set('error','access_denied');
   const proof=await consumeOidcCallback({request:x.request(dest.toString()),store:x.store,
    expectedRedirectUri:config.redirectUri,expectedIssuer:config.issuer,
    nowMs:failure==='expired'?now+601000:now+1000});
   expect(proof,failure).toBeNull();
  }
 });
 it('fails closed on insecure provider, redirect or injected extra auth endpoint params',()=>{
  expect(()=>beginOidcLogin({...config,authorizationEndpoint:'http://accounts.example.test/authorize'},now)).toThrow('OIDC_LOGIN_CONFIG_INVALID');
  expect(()=>beginOidcLogin({...config,redirectUri:'https://attacker.test/cb#fragment'},now)).toThrow('OIDC_LOGIN_CONFIG_INVALID');
  expect(()=>beginOidcLogin({...config,authorizationEndpoint:'https://attacker.test/authorize'},now)).toThrow('OIDC_LOGIN_CONFIG_INVALID');
  expect(()=>beginOidcLogin({...config,authorizationEndpoint:'https://accounts.example.test/authorize?evil=1'},now)).toThrow('OIDC_LOGIN_CONFIG_INVALID');
 });
 it('allows only one success under concurrent callback attempts',async()=>{
  const x=prepared();
  const [a,b]=await Promise.all([0,1].map(()=>consumeOidcCallback({
   request:x.request(),store:x.store,expectedRedirectUri:config.redirectUri,
   expectedIssuer:config.issuer,nowMs:now+1000
  })));
  expect([a,b].filter(Boolean)).toHaveLength(1);
 });
});
