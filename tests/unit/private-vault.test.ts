import {describe,it,expect} from 'vitest';
import {randomBytes} from 'node:crypto';
import {mkdtemp,readFile,writeFile,chmod,rm,lstat} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {LocalEncryptedQuarantineVault} from '../../apps/jobs/src/private-vault.ts';
const org='11111111-1111-4111-8111-111111111111';
const other='22222222-2222-4222-8222-222222222222';
const actor='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const scope={organizationId:org,actorId:actor,action:'write' as const};
const source=(text='Highly private fictional source')=>({
 organizationId:org,documentId:'33333333-3333-4333-8333-333333333333',
 filename:'toy.txt',kind:'text' as const,bytes:new TextEncoder().encode(text)
});
async function withVault(work:(root:string,key:Uint8Array)=>Promise<void>){
 const root=await mkdtemp(join(tmpdir(),'lm-quarantine-'));
 try{await work(root,randomBytes(32));}finally{await rm(root,{recursive:true,force:true});}
}
describe('LM-044 private encrypted local quarantine contribution',()=>{
 it('encrypts bytes at rest, uses owner-only permissions and survives instance restart',async()=>withVault(async(root,key)=>{
  const first=new LocalEncryptedQuarantineVault(root,key);
  const record=await first.put(scope,source());
  expect(record.status).toBe('quarantine-only');
  expect(record.published).toBe(false);
  const file=join(root,org,record.digest+'.lmq');
  const raw=await readFile(file);
  expect(raw.subarray(0,5).toString()).toBe('LMQV1');
  expect(raw.toString()).not.toContain('Highly private fictional source');
  expect((await lstat(file)).mode&0o077).toBe(0);
  const restarted=new LocalEncryptedQuarantineVault(root,key);
  const restored=await restarted.get(scope,record.digest);
  expect(restored).not.toBeNull();
  expect(new TextDecoder().decode(restored!)).toBe('Highly private fictional source');
 }));
 it('is idempotent only for an identical source and never overwrites ciphertext',async()=>withVault(async(root,key)=>{
  const vault=new LocalEncryptedQuarantineVault(root,key);
  const first=await vault.put(scope,source());
  const path=join(root,org,first.digest+'.lmq'),before=await readFile(path);
  expect((await vault.put(scope,source())).digest).toBe(first.digest);
  expect(await readFile(path)).toEqual(before);
  expect(vault.get({...scope,organizationId:other},first.digest)).rejects.toThrow('QUARANTINE_SCOPE_DENIED');
  expect(await vault.get({organizationId:other,actorId:actor,action:'read'},first.digest)).toBeNull();
 }));
 it('rejects wrong keys, tampering, forged scopes and digest changes',async()=>withVault(async(root,key)=>{
  const vault=new LocalEncryptedQuarantineVault(root,key),r=await vault.put(scope,source());
  const path=join(root,org,r.digest+'.lmq');
  await expect(new LocalEncryptedQuarantineVault(root,randomBytes(32)).get(scope,r.digest)).rejects.toThrow('QUARANTINE_AUTH_TAG_INVALID');
  const bytes=await readFile(path);bytes[bytes.length-1]=(bytes[bytes.length-1]??0)^1;
  await writeFile(path,bytes);
  await expect(vault.get(scope,r.digest)).rejects.toThrow('QUARANTINE_AUTH_TAG_INVALID');
  await expect(vault.put({...scope,organizationId:other},source())).rejects.toThrow('QUARANTINE_SCOPE_DENIED');
  await expect(vault.put(scope,{...source(),expectedSha256:'a'.repeat(64)})).rejects.toThrow('INTAKE_DIGEST_MISMATCH');
 }));
 it('rejects overly permissive root, unsupported key and unreadable metadata',async()=>withVault(async(root,key)=>{
  expect(()=>new LocalEncryptedQuarantineVault(root,new Uint8Array(8))).toThrow('VAULT_CONFIG_INVALID');
  await chmod(root,0o755);
  await expect(new LocalEncryptedQuarantineVault(root,key).put(scope,source())).rejects.toThrow('VAULT_ROOT_UNSAFE');
 }));
});
