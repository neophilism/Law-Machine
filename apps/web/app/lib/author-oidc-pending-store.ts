import type {PendingOidcLogin,PendingOidcLoginStore} from './author-oidc-pkce.ts';

export interface PendingLoginDatabase {
 /** Trusted server-only, least-privilege connection; never accept SQL or parameters from HTTP. */
 query(sql:string,parameters:readonly unknown[]):Promise<{readonly rows:readonly Record<string,unknown>[]}>
}
export type PendingLoginBinding=Pick<PendingOidcLogin,'stateDigest'|'browserDigest'|'issuer'|'redirectUri'>;
export interface PendingLoginProtector {
 /** Authenticated encryption using a maintained server/KMS implementation. Bind all metadata as AAD. */
 seal(value:PendingOidcLogin,binding:PendingLoginBinding):Promise<Uint8Array>;
 /** Reject altered ciphertext/binding. Keys and plaintext must never be logged or returned to a browser. */
 open(ciphertext:Uint8Array,binding:PendingLoginBinding):Promise<unknown>;
}
const DIGEST=/^[a-f0-9]{64}$/;
const TOKEN=/^[A-Za-z0-9_-]{43}$/;
function https(value:unknown):value is string{
 try{
  if(typeof value!=='string'||value.length>2048)return false;
  const url=new URL(value);
  return url.protocol==='https:'&&!url.username&&!url.password&&!url.search&&!url.hash&&!url.port&&url.toString()===value;
 }catch{return false;}
}
function valid(value:unknown,now:number):value is PendingOidcLogin{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const v=value as Record<string,unknown>;
 return typeof v.stateDigest==='string'&&DIGEST.test(v.stateDigest)&&
  typeof v.browserDigest==='string'&&DIGEST.test(v.browserDigest)&&
  typeof v.codeVerifier==='string'&&TOKEN.test(v.codeVerifier)&&
  typeof v.nonce==='string'&&TOKEN.test(v.nonce)&&https(v.issuer)&&https(v.redirectUri)&&
  typeof v.issuedAtMs==='number'&&Number.isSafeInteger(v.issuedAtMs)&&v.issuedAtMs>0&&
  typeof v.expiresAtMs==='number'&&Number.isSafeInteger(v.expiresAtMs)&&
  v.expiresAtMs-v.issuedAtMs===600000&&v.issuedAtMs<=now&&v.expiresAtMs>now;
}
function binding(value:PendingOidcLogin):PendingLoginBinding{
 return {stateDigest:value.stateDigest,browserDigest:value.browserDigest,issuer:value.issuer,redirectUri:value.redirectUri};
}
function snapshot(value:PendingOidcLogin):PendingOidcLogin{
 return Object.freeze({...binding(value),codeVerifier:value.codeVerifier,nonce:value.nonce,
  issuedAtMs:value.issuedAtMs,expiresAtMs:value.expiresAtMs});
}
function time(value:unknown):number{
 if(value instanceof Date)return value.getTime();
 if(typeof value!=='string'||!/(?:Z|[+-]\d{2}:\d{2})$/.test(value))return NaN;
 return Date.parse(value);
}

/** Durable atomic pending state. No connection, encryption key or public route is configured here. */
export class PostgresPendingOidcStore implements PendingOidcLoginStore{
 constructor(private readonly database:PendingLoginDatabase,
  private readonly protector:PendingLoginProtector,private readonly now:()=>number=Date.now){}

 async save(value:PendingOidcLogin):Promise<void>{
  try{
   const now=this.now();
   if(!Number.isSafeInteger(now)||!valid(value,now))throw Error();
   value=snapshot(value);
   const sealed=await this.protector.seal(value,binding(value));
   if(!(sealed instanceof Uint8Array)||sealed.byteLength<32||sealed.byteLength>8192)throw Error();
   const result=await this.database.query(
    'INSERT INTO lm_oidc_pending_logins (state_digest,browser_digest,issuer,redirect_uri,encrypted_payload,issued_at,expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING state_digest',
    [value.stateDigest,value.browserDigest,value.issuer,value.redirectUri,Buffer.from(sealed),
     new Date(value.issuedAtMs).toISOString(),new Date(value.expiresAtMs).toISOString()]);
   if(result.rows.length!==1||result.rows[0]?.state_digest!==value.stateDigest)throw Error();
  }catch{throw Error('OIDC_PENDING_STORAGE_UNAVAILABLE');}
 }

 async consume(stateDigest:string,browserDigest:string):Promise<PendingOidcLogin|null>{
  try{
   if(typeof stateDigest!=='string'||typeof browserDigest!=='string'||!DIGEST.test(stateDigest)||!DIGEST.test(browserDigest))return null;
   // The migration function matches BOTH bindings and deletes/returns once in
   // a single SQL statement across workers. Never split this into SELECT+DELETE.
   const result=await this.database.query(
    'SELECT issuer,redirect_uri,encrypted_payload,issued_at,expires_at FROM lm_consume_oidc_pending($1,$2)',
    [stateDigest,browserDigest]);
   if(result.rows.length!==1)return null;
   const row=result.rows[0]!;
   if(!https(row.issuer)||!https(row.redirect_uri)||!(row.encrypted_payload instanceof Uint8Array)||
      row.encrypted_payload.byteLength<32||row.encrypted_payload.byteLength>8192)return null;
   const proof={stateDigest,browserDigest,issuer:row.issuer,redirectUri:row.redirect_uri};
   const value=await this.protector.open(row.encrypted_payload,proof);
   const now=this.now();
   if(!Number.isSafeInteger(now)||!valid(value,now)||
      value.stateDigest!==stateDigest||value.browserDigest!==browserDigest||
      value.issuer!==row.issuer||value.redirectUri!==row.redirect_uri||
      value.issuedAtMs!==time(row.issued_at)||value.expiresAtMs!==time(row.expires_at))return null;
   return snapshot(value);
  }catch{return null;}
 }
}
