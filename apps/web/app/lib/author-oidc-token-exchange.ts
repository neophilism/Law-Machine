import type {CompletedOidcCallback} from './author-oidc-pkce.ts';
/** Provider-neutral, server-only token exchange for an already consumed PKCE callback.
 * Returned ID token is untrusted until verified against independently trusted JWKS and bound nonce.
 */
export async function exchangeOidcCode(input:{
 readonly callback:CompletedOidcCallback;readonly tokenEndpoint:string;
 readonly clientId:string;readonly fetcher:typeof fetch;
}):Promise<string|null>{
 try{
  const {callback,tokenEndpoint,clientId,fetcher}=input;
  const endpoint=new URL(tokenEndpoint),issuer=new URL(callback.issuer),redirect=new URL(callback.redirectUri);
  if(endpoint.protocol!=='https:'||endpoint.origin!==issuer.origin||
     endpoint.username||endpoint.password||endpoint.search||endpoint.hash||
     endpoint.port||endpoint.toString()!==tokenEndpoint||
     redirect.protocol!=='https:'||redirect.username||redirect.password||
     redirect.search||redirect.hash||
     !/^[A-Za-z0-9._:-]{1,128}$/.test(clientId)||
     !/^[A-Za-z0-9._~+/=-]{8,2048}$/.test(callback.code)||
     !/^[A-Za-z0-9_-]{43}$/.test(callback.codeVerifier)||
     !/^[A-Za-z0-9_-]{43}$/.test(callback.nonce))return null;
  const body=new URLSearchParams({grant_type:'authorization_code',code:callback.code,
   redirect_uri:callback.redirectUri,client_id:clientId,code_verifier:callback.codeVerifier});
  const response=await fetcher(endpoint.toString(),{
   method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',
    'accept':'application/json'},body:body.toString(),redirect:'error',
   cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(10000)
  });
  if(!response.ok||response.status!==200||
     !(response.headers.get('content-type')??'').toLowerCase().startsWith('application/json')||
     Number(response.headers.get('content-length')??'0')>32768)return null;
  const text=await response.text();
  if(text.length>32768)return null;
  const parsed:unknown=JSON.parse(text);
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))return null;
  const data=parsed as Record<string,unknown>;
  if(data.token_type!==undefined&&data.token_type!=='Bearer')return null;
  if(typeof data.id_token!=='string'||data.id_token.length<100||data.id_token.length>14000)return null;
  return data.id_token;
 }catch{return null;}
}
