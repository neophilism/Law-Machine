import { createPublicKey, verify } from 'node:crypto';

/**
 * LM-043: server-side, offline OIDC ID-token verifier.
 * A caller MUST first complete a server-side OAuth/PKCE callback, consume
 * its single-use nonce, and obtain trusted JWKS material over authenticated
 * infrastructure. This verifier alone does not log users in or issue sessions.
 */
export type TrustedOidcPolicy = {
  readonly issuer: string;
  readonly clientId: string;
  readonly expectedNonce: string;
  readonly nowSeconds: number;
  readonly maxTokenAgeSeconds?: number;
  readonly maxAuthAgeSeconds?: number;
};
export type OidcIdentityProof = {
  readonly issuer: string;
  readonly subject: string;
  readonly issuedAtSeconds: number;
  readonly expiresAtSeconds: number;
  readonly lastAuthenticatedAtSeconds: number;
};
type JsonObject = Record<string, unknown>;
const B64 = /^[A-Za-z0-9_-]+$/;
const KID = /^[A-Za-z0-9_.:-]{1,128}$/;
const plain = (v:unknown):v is JsonObject =>
  v !== null && typeof v === 'object' && !Array.isArray(v) &&
  (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
const sec = (v:unknown):v is number => typeof v === 'number' && Number.isSafeInteger(v) && v>0;
function decode(part:string, max:number):JsonObject|null {
  if(part.length===0 || part.length>max || !B64.test(part)) return null;
  try {
    const bytes=Buffer.from(part,'base64url');
    if(bytes.toString('base64url')!==part) return null;
    const parsed:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    return plain(parsed) ? parsed : null;
  } catch { return null; }
}
function trustedIssuer(value:string):boolean {
  try {
    const url=new URL(value);
    return url.protocol==='https:' && !!url.hostname &&
      !url.username && !url.password && !url.search && !url.hash &&
      !url.port && url.toString()===value;
  } catch { return false; }
}
/** Returns null for ALL failed proofs; neither JWTs nor key material enter error messages. */
export function verifyOidcIdToken(
  compact:unknown, jwks:unknown, policy:TrustedOidcPolicy
):OidcIdentityProof|null {
  try {
    if(!policy || !trustedIssuer(policy.issuer) ||
      typeof policy.clientId!=='string' || policy.clientId.length<1 ||
      policy.clientId.length>128 || typeof policy.expectedNonce!=='string' ||
      policy.expectedNonce.length<16 || policy.expectedNonce.length>256 ||
      !sec(policy.nowSeconds)) return null;
    const age=policy.maxTokenAgeSeconds??3600;
    const reauth=policy.maxAuthAgeSeconds??900;
    if(!sec(age)||age>86400||!sec(reauth)||reauth>86400) return null;
    if(typeof compact!=='string'||compact.length>14000) return null;
    const parts=compact.split('.');
    if(parts.length!==3) return null;
    const headerPart=parts[0]!, payloadPart=parts[1]!, signaturePart=parts[2]!;
    const header=decode(headerPart,2048);
    const payload=decode(payloadPart,10000);
    if(!header || !payload || header.alg!=='RS256' ||
      typeof header.kid!=='string' || !KID.test(header.kid) ||
      (header.typ!==undefined && header.typ!=='JWT') ||
      'crit' in header || 'jku' in header || 'x5u' in header ||
      !B64.test(signaturePart) || signaturePart.length>1024) return null;
    const signature=Buffer.from(signaturePart,'base64url');
    if(signature.toString('base64url')!==signaturePart) return null;
    if(!plain(jwks) || !Array.isArray(jwks.keys) ||
      jwks.keys.length<1 || jwks.keys.length>24) return null;
    const matches=jwks.keys.filter((key:unknown)=>
      plain(key) && key.kid===header.kid);
    if(matches.length!==1) return null;
    const key=matches[0];
    if(!plain(key) || key.kty!=='RSA' ||
      (key.use!==undefined && key.use!=='sig') ||
      (key.alg!==undefined && key.alg!=='RS256') ||
      (key.key_ops!==undefined && (!Array.isArray(key.key_ops) ||
        !key.key_ops.includes('verify'))) ||
      typeof key.n!=='string' || typeof key.e!=='string' ||
      !B64.test(key.n) || !B64.test(key.e) ||
      'd' in key || 'p' in key || 'q' in key) return null;
    const publicKey=createPublicKey({key: {kty:'RSA',n:key.n,e:key.e},format:'jwk'});
    if(publicKey.asymmetricKeyType!=='rsa' ||
      (publicKey.asymmetricKeyDetails?.modulusLength??0)<2048) return null;
    if(!verify('RSA-SHA256',Buffer.from(headerPart+'.'+payloadPart),
      publicKey,signature)) return null;
    const now=policy.nowSeconds;
    if(payload.iss!==policy.issuer ||
      typeof payload.sub!=='string' || payload.sub.length<1 ||
      payload.sub.length>255 || payload.nonce!==policy.expectedNonce ||
      !sec(payload.iat) || !sec(payload.exp) || !sec(payload.auth_time) ||
      payload.iat>now+60 || payload.exp<=now-60 ||
      payload.exp<=payload.iat || payload.exp-payload.iat>86400 ||
      now-payload.iat>age || payload.auth_time>now+60 ||
      payload.auth_time>payload.iat+60 ||
      now-payload.auth_time>reauth ||
      (payload.nbf!==undefined &&
        (!sec(payload.nbf)||payload.nbf>now+60))) return null;
    const aud=payload.aud;
    if(typeof aud==='string') {
      if(aud!==policy.clientId) return null;
      if(payload.azp!==undefined && payload.azp!==policy.clientId)return null;
    } else if(Array.isArray(aud) && aud.length>=1 && aud.length<=8 &&
      aud.every(v=>typeof v==='string')) {
      if(!aud.includes(policy.clientId) ||
        (aud.length>1 && payload.azp!==policy.clientId)) return null;
    } else return null;
    return Object.freeze({
      issuer:payload.iss as string,subject:payload.sub,
      issuedAtSeconds:payload.iat,expiresAtSeconds:payload.exp,
      lastAuthenticatedAtSeconds:payload.auth_time
    });
  } catch { return null; }
}
