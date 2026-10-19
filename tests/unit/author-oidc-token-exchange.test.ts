import {describe,it,expect,vi} from 'vitest';
import {exchangeOidcCode} from '../../apps/web/app/lib/author-oidc-token-exchange.ts';
const callback={code:'valid-auth-code-12345',codeVerifier:'a'.repeat(43),nonce:'b'.repeat(43),
 issuer:'https://login.example.test/',redirectUri:'https://app.example.test/callback',
 clearCookie:'__Host-lm_oidc=; Secure; HttpOnly; Path=/; SameSite=Lax; Max-Age=0'};
const token=['e30','e30','x'.repeat(128)].join('.');
function respond(json:unknown){return new Response(JSON.stringify(json),{status:200,headers:{'content-type':'application/json'}});}
describe('LM-043 OIDC authorization-code exchange preflight',()=>{
 it('posts PKCE secret only to pinned same-issuer HTTPS endpoint without credentials or redirects',async()=>{
  const fetcher=vi.fn(async(_url:string,init?:RequestInit)=>{expect(init?.method).toBe('POST');
   expect(init?.credentials).toBe('omit');expect(init?.redirect).toBe('error');
   const body=new URLSearchParams(init?.body as string);
   expect(body.get('code_verifier')).toBe(callback.codeVerifier);
   expect(body.get('client_id')).toBe('law-machine');return respond({id_token:token,token_type:'Bearer'});});
  expect(await exchangeOidcCode({callback,tokenEndpoint:'https://login.example.test/token',clientId:'law-machine',fetcher:fetcher as unknown as typeof fetch})).toBe(token);
  expect(fetcher).toHaveBeenCalledOnce();
 });
 it('rejects foreign issuer, HTTP and endpoint query before any request',async()=>{
  const fetcher=vi.fn(async()=>respond({id_token:token}));
  for(const tokenEndpoint of ['https://attacker.test/token','http://login.example.test/token','https://login.example.test/token?access=1']){
   expect(await exchangeOidcCode({callback,tokenEndpoint,clientId:'law-machine',fetcher:fetcher as unknown as typeof fetch})).toBeNull();
  }
  expect(fetcher).not.toHaveBeenCalled();
 });
 it('rejects network failure and malformed or absent id token',async()=>{
  const endpoint='https://login.example.test/token';
  for(const fetcher of [async()=>respond({access_token:'only-access-token'}),async()=>respond({id_token:'not-a-jwt'}),async()=>{throw Error('offline');}]){
   expect(await exchangeOidcCode({callback,tokenEndpoint:endpoint,clientId:'law-machine',fetcher:fetcher as typeof fetch})).toBeNull();
  }
 });
});
