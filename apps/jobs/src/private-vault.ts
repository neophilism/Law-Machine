import {createCipheriv,createDecipheriv,createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {constants} from 'node:fs';
import {lstat,link,mkdir,open,realpath,unlink,writeFile} from 'node:fs/promises';
import {isAbsolute,join,resolve} from 'node:path';
import {inspectQuarantineCandidate,MAX_INTAKE_BYTES,type IntakeRequest,type QuarantineCandidate} from '../../../packages/legislation/src/source-intake.ts';

/**
 * LM-044: encrypted, private, host-local quarantine adapter for offline development
 * and restart tests. NOT a production object store: no public HTTP surface, cloud
 * durability, signing keys, backups or real user authentication are supplied.
 */
const MAGIC=Buffer.from('LMQV1');
const SHA=/^[a-f0-9]{64}$/;
const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const HEADER=5+12+16;
type PrivateScope={readonly organizationId:string;readonly actorId:string;readonly action:'read'|'write'};
function verifyScope(scope:PrivateScope, organizationId:string, action:'read'|'write'):string {
 if(!scope || !UUID.test(scope.organizationId) || !UUID.test(scope.actorId) ||
    scope.organizationId.toLowerCase()!==organizationId.toLowerCase() ||
    (action==='write' && scope.action!=='write') ||
    (action==='read' && !['read','write'].includes(scope.action)))
   throw Error('QUARANTINE_SCOPE_DENIED');
 return organizationId.toLowerCase();
}
function hasUnsafeMode(mode:number):boolean{return (mode&0o077)!==0;}
export class LocalEncryptedQuarantineVault {
 private readonly root:string;
 private readonly encryptionKey:Buffer;
 constructor(root:string,key:Uint8Array){
  if(typeof root!=='string'||!isAbsolute(root)||root.length>2048||
     !(key instanceof Uint8Array)||key.byteLength!==32)throw Error('VAULT_CONFIG_INVALID');
  this.root=resolve(root);
  this.encryptionKey=Buffer.from(key);
 }
 private async directory(org:string):Promise<string>{
  await mkdir(this.root,{recursive:true,mode:0o700});
  const rootInfo=await lstat(this.root);
  if(!rootInfo.isDirectory()||hasUnsafeMode(rootInfo.mode)||
     await realpath(this.root)!==this.root)throw Error('VAULT_ROOT_UNSAFE');
  const path=join(this.root,org);
  await mkdir(path,{mode:0o700,recursive:true});
  const info=await lstat(path);
  if(!info.isDirectory()||hasUnsafeMode(info.mode)||
     await realpath(path)!==path)throw Error('VAULT_TENANT_DIR_UNSAFE');
  return path;
 }
 private encrypt(org:string,digest:string,bytes:Uint8Array):Buffer{
  const nonce=randomBytes(12);
  const cipher=createCipheriv('aes-256-gcm',this.encryptionKey,nonce);
  cipher.setAAD(Buffer.from(org+'/'+digest));
  const ciphertext=Buffer.concat([cipher.update(bytes),cipher.final()]);
  return Buffer.concat([MAGIC,nonce,cipher.getAuthTag(),ciphertext]);
 }
 private decrypt(org:string,digest:string,data:Buffer):Uint8Array{
  if(data.length<HEADER || data.length>MAX_INTAKE_BYTES+HEADER ||
     !data.subarray(0,MAGIC.length).equals(MAGIC))
    throw Error('QUARANTINE_CIPHERTEXT_INVALID');
  try{
   const decipher=createDecipheriv('aes-256-gcm',this.encryptionKey,data.subarray(5,17));
   decipher.setAAD(Buffer.from(org+'/'+digest));
   decipher.setAuthTag(data.subarray(17,33));
   return Buffer.concat([decipher.update(data.subarray(33)),decipher.final()]);
  }catch{throw Error('QUARANTINE_AUTH_TAG_INVALID');}
 }
 async put(scope:PrivateScope,request:IntakeRequest):Promise<QuarantineCandidate>{
  if(!request)throw Error('QUARANTINE_SCOPE_DENIED');
  const org=verifyScope(scope,request.organizationId,'write');
  if(!(request.bytes instanceof Uint8Array))throw Error('QUARANTINE_BYTES_INVALID');
  const bytes=request.bytes.slice();
  const candidate=await inspectQuarantineCandidate({...request,bytes});
  const directory=await this.directory(org),target=join(directory,candidate.digest+'.lmq');
  const temporary=join(directory,'.pending-'+randomBytes(20).toString('hex'));
  const encrypted=this.encrypt(org,candidate.digest,bytes);
  try{
   await writeFile(temporary,encrypted,{flag:'wx',mode:0o600});
   try { await link(temporary,target); }
   catch(error){
    if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;
    const existing=await this.get({organizationId:org,actorId:scope.actorId,action:'read'},candidate.digest);
    if(existing===null||existing.byteLength!==bytes.byteLength||
       !timingSafeEqual(Buffer.from(existing),Buffer.from(bytes)))
      throw Error('QUARANTINE_EXISTING_OBJECT_INVALID');
   }
  }finally{
   try{await unlink(temporary);}catch(error){
    if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;
   }
  }
  return candidate;
 }
 /** Bytes are for trusted private review only; never expose through a public URL. */
 async get(scope:PrivateScope,digest:string):Promise<Uint8Array|null>{
  const org=verifyScope(scope,scope?.organizationId??'','read');
  if(!SHA.test(digest))throw Error('QUARANTINE_DIGEST_INVALID');
  const directory=await this.directory(org),target=join(directory,digest+'.lmq');
  let file;
  try{
   file=await open(target,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
  }catch(error){
   if((error as NodeJS.ErrnoException).code==='ENOENT')return null;
   throw Error('QUARANTINE_READ_DENIED');
  }
  let data:Buffer;
  try{
   const st=await file.stat();
   if(!st.isFile()||hasUnsafeMode(st.mode)||
      st.size<HEADER||st.size>MAX_INTAKE_BYTES+HEADER)
    throw Error('QUARANTINE_FILE_UNSAFE');
   data=await file.readFile();
  }finally{await file.close();}
  const bytes=this.decrypt(org,digest,data);
  // Prevent a storage-key/object swap even if ciphertext was copied across paths.
  if(createHash('sha256').update(bytes).digest('hex')!==digest)
   throw Error('QUARANTINE_CONTENT_DIGEST_MISMATCH');
  return bytes;
 }
}
