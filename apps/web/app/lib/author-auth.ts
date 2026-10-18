/**
 * LM-043 server-only author access checks. This module accepts identities ONLY
 * from an authenticated adapter; never from client-provided actor/role/org IDs.
 * Provider integration and public author endpoints remain disabled until proven.
 */
export type AuthorRole = 'contributor' | 'editor' | 'publisher';
export type VerifiedAuthorSession = {
  readonly kind: 'server-verified-identity';
  readonly subject: string;
  readonly sessionId: string;
  readonly issuedAt: number;
  readonly expiresAt: number;
  readonly lastReauthenticatedAt: number;
  readonly csrfToken: string;
};
export type CurrentMembership = {
  readonly subject: string;
  readonly organizationId: string;
  readonly roles: readonly AuthorRole[];
  readonly revision: number;
  readonly revokedAt: number | null;
};
export interface AuthorIdentityAdapter {
  verifySession(request: Request): Promise<VerifiedAuthorSession | null>;
  currentMembership(subject: string, organizationId: string): Promise<CurrentMembership | null>;
}
export type AuthorAction = 'view' | 'edit' | 'publish';
export type AuthorContext = {
  readonly organizationId: string;
  readonly subject: string;
  readonly sessionId: string;
  readonly membershipRevision: number;
  readonly action: AuthorAction;
};
export type AuthorizationOutcome =
  | { readonly authorized: true; readonly context: AuthorContext }
  | { readonly authorized: false; readonly code: 'AUTH_REQUIRED' | 'SESSION_EXPIRED' |
      'SESSION_INVALID' | 'MEMBERSHIP_REQUIRED' | 'ORG_ACCESS_DENIED' |
      'REAUTH_REQUIRED' | 'CSRF_INVALID' | 'ACTION_INVALID' };

const ID=/^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$/;
const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const validTime=(x:unknown):x is number=>typeof x==='number'&&Number.isSafeInteger(x)&&x>0;
const roleGrants:Readonly<Record<AuthorAction,ReadonlySet<AuthorRole>>>={
  view:new Set(['contributor','editor','publisher']),
  edit:new Set(['contributor','editor','publisher']),
  publish:new Set(['publisher'])
};
const deny=(code:Extract<AuthorizationOutcome,{authorized:false}>['code']):AuthorizationOutcome=>({authorized:false,code});

export async function authorizeAuthorAction(input:{
  readonly request:Request;
  readonly organizationId:string;
  readonly action:AuthorAction;
  readonly adapter:AuthorIdentityAdapter;
  readonly now?:number;
}):Promise<AuthorizationOutcome>{
  const {request,organizationId,action,adapter}=input;
  if(!UUID.test(organizationId) || !Object.hasOwn(roleGrants,action))return deny('ACTION_INVALID');
  if(!request || !(request instanceof Request) || !adapter) return deny('SESSION_INVALID');
  const now=input.now??Date.now();
  if(!validTime(now))return deny('SESSION_INVALID');
  let session:VerifiedAuthorSession|null;
  try{session=await adapter.verifySession(request);}catch{return deny('AUTH_REQUIRED');}
  if(!session)return deny('AUTH_REQUIRED');
  if(session.kind!=='server-verified-identity'||typeof session.subject!=='string'||
     !ID.test(session.subject)||!ID.test(session.sessionId)||
     !validTime(session.issuedAt)||!validTime(session.expiresAt)||
     !validTime(session.lastReauthenticatedAt)||session.issuedAt>now+30000||
     session.lastReauthenticatedAt>now+30000||
     session.lastReauthenticatedAt<session.issuedAt||
     session.lastReauthenticatedAt>session.expiresAt||
     session.expiresAt<=session.issuedAt||
     typeof session.csrfToken!=='string'||session.csrfToken.length<32||
     session.csrfToken.length>256)return deny('SESSION_INVALID');
  if(session.expiresAt<=now || now-session.issuedAt>24*60*60*1000)return deny('SESSION_EXPIRED');
  let membership:CurrentMembership|null;
  try{membership=await adapter.currentMembership(session.subject,organizationId);}
  catch{return deny('MEMBERSHIP_REQUIRED');}
  if(!membership||membership.subject!==session.subject||membership.organizationId!==organizationId||
     !Array.isArray(membership.roles)||membership.roles.length>3||
     !Number.isSafeInteger(membership.revision)||membership.revision<1||
     !(membership.revokedAt===null||validTime(membership.revokedAt))||
     membership.roles.some(r=>!['contributor','editor','publisher'].includes(r)))
     return deny('MEMBERSHIP_REQUIRED');
  if(membership.revokedAt!==null)return deny('ORG_ACCESS_DENIED');
  if(!membership.roles.some(role=>roleGrants[action].has(role)))return deny('ORG_ACCESS_DENIED');
  if(action==='publish' && now-session.lastReauthenticatedAt>15*60*1000)return deny('REAUTH_REQUIRED');
  if(!['GET','HEAD','OPTIONS'].includes(request.method)){
    let origin:string|null=null;
    try{origin=new URL(request.headers.get('origin')??'').origin;}catch{return deny('CSRF_INVALID');}
    if(origin!==new URL(request.url).origin ||
       request.headers.get('x-law-machine-csrf')!==session.csrfToken)
      return deny('CSRF_INVALID');
  }
  return {authorized:true,context:{
    organizationId,subject:session.subject,sessionId:session.sessionId,
    membershipRevision:membership.revision,action
  }};
}

/** Explicit failure adapter until a verified maintained identity provider is wired. */
export class DisabledAuthorIdentityAdapter implements AuthorIdentityAdapter{
  async verifySession():Promise<null>{return null;}
  async currentMembership():Promise<null>{return null;}
}

/** Tests only. Not signed, networked, persistent or safe for production routes. */
export class FixtureAuthorIdentityAdapter implements AuthorIdentityAdapter {
  readonly memberships=new Map<string,CurrentMembership>();
  session:VerifiedAuthorSession|null=null;
  async verifySession():Promise<VerifiedAuthorSession|null>{return this.session;}
  async currentMembership(subject:string,organizationId:string):Promise<CurrentMembership|null>{
    return this.memberships.get(subject+'|'+organizationId)??null;
  }
}
