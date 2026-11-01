import type {CurrentMembership,AuthorRole} from './author-auth.ts';
import type {AuthorSessionStore,StoredAuthorSession} from './author-cookie-session.ts';

type Rows={readonly rows:readonly Record<string,unknown>[]};
export interface AuthorSessionDatabase {
 /** Dedicated trusted auth-service connection with narrow explicit session grants. */
 queryAuth(sql:string,parameters:readonly unknown[]):Promise<Rows>;
 /** Must set app.organization_id transaction-locally on the SAME connection as the query. */
 queryInOrganization(organizationId:string,sql:string,parameters:readonly unknown[]):Promise<Rows>;
}
const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const DIGEST=/^[a-f0-9]{64}$/;
function timestamp(value:unknown):number{
 if(value instanceof Date)return value.getTime();
 if(typeof value!=='string'||!/(?:Z|[+-]\d{2}:\d{2})$/.test(value))return NaN;
 return Date.parse(value);
}
function id(value:unknown):value is string{return typeof value==='string'&&UUID.test(value);}
function digest(value:unknown):value is string{return typeof value==='string'&&DIGEST.test(value);}
function revision(value:unknown):number{
 if(typeof value==='string'&&!/^[1-9]\d{0,15}$/.test(value))return NaN;
 const result=typeof value==='number'||typeof value==='string'?Number(value):NaN;
 return Number.isSafeInteger(result)&&result>0?result:NaN;
}

/** Persistent, uncached session/member reads. No service role or public route is enabled. */
export class PostgresAuthorSessionStore implements AuthorSessionStore{
 constructor(private readonly database:AuthorSessionDatabase){}
 async lookupSession(tokenDigest:string):Promise<StoredAuthorSession|null>{
  try{
   if(!digest(tokenDigest))return null;
   const result=await this.database.queryAuth(
    'SELECT id,token_digest,csrf_digest,actor_id,issued_at,expires_at,last_reauthenticated_at,revoked_at FROM lm_author_sessions WHERE token_digest=$1 AND revoked_at IS NULL',
    [tokenDigest]);
   if(result.rows.length!==1)return null;
   const row=result.rows[0]!;
   if(!id(row.id)||!id(row.actor_id)||row.token_digest!==tokenDigest||!digest(row.csrf_digest)||row.revoked_at!==null)return null;
   const issuedAt=timestamp(row.issued_at),expiresAt=timestamp(row.expires_at),lastReauthenticatedAt=timestamp(row.last_reauthenticated_at);
   if(![issuedAt,expiresAt,lastReauthenticatedAt].every(value=>Number.isSafeInteger(value)&&value>0))return null;
   return {id:row.id,actorId:row.actor_id,tokenDigest,csrfDigest:row.csrf_digest,
    issuedAt,expiresAt,lastReauthenticatedAt,revokedAt:null};
  }catch{return null;}
 }
 async lookupMembership(actorId:string,organizationId:string):Promise<CurrentMembership|null>{
  try{
   if(!id(actorId)||!id(organizationId))return null;
   const result=await this.database.queryInOrganization(organizationId,
    'SELECT org_id,actor_id,role,membership_revision,revoked_at FROM lm_memberships WHERE org_id=$1 AND actor_id=$2',
    [organizationId,actorId]);
   if(result.rows.length!==1)return null;
   const row=result.rows[0]!,memberRevision=revision(row.membership_revision);
   if(row.org_id!==organizationId||row.actor_id!==actorId||typeof row.role!=='string'||
      !['contributor','editor','publisher'].includes(row.role)||!Number.isSafeInteger(memberRevision))return null;
   const revokedAt=row.revoked_at===null?null:timestamp(row.revoked_at);
   if(revokedAt!==null&&(!Number.isSafeInteger(revokedAt)||revokedAt<=0))return null;
   return {subject:actorId,organizationId,roles:[row.role as AuthorRole],revision:memberRevision,revokedAt};
  }catch{return null;}
 }
 /** Caller must already authenticate the session owner and validate logout CSRF/Origin. */
 async revokeSession(sessionId:string,actorId:string):Promise<boolean>{
  try{
   if(!id(sessionId)||!id(actorId))return false;
   const result=await this.database.queryAuth(
    'UPDATE lm_author_sessions SET revoked_at=COALESCE(revoked_at,clock_timestamp()) WHERE id=$1 AND actor_id=$2 RETURNING id',
    [sessionId,actorId]);
   return result.rows.length===1&&result.rows[0]?.id===sessionId;
  }catch{return false;}
 }
}
