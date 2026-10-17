import {describe,it,expect} from 'vitest';
import {inspectQuarantineCandidate,validateOfficialSourceUrl,MAX_INTAKE_BYTES} from '../../packages/legislation/src/source-intake.ts';

const org='11111111-1111-4111-8111-111111111111';
const document='22222222-2222-4222-8222-222222222222';
const input=(body='Section 1. Fictional document',filename='fictional.txt')=>({
 organizationId:org,documentId:document,filename,kind:'text' as const,
 bytes:new TextEncoder().encode(body)
});
describe('LM-044 disabled private source intake policy',()=>{
 it('always produces scoped quarantine-only metadata and never claims publication',async()=>{
  const x=await inspectQuarantineCandidate(input());
  expect(x.status).toBe('quarantine-only');
  expect(x.published).toBe(false);
  expect(x.organizationId).toBe(org);
  expect(x.privateObjectKey).toMatch(new RegExp('^quarantine/'+org+'/sha256/[a-f0-9]{64}$'));
  expect(x.privateObjectKey).not.toContain('fictional');
  const b=await inspectQuarantineCandidate(input('Section 1. Fictional document\r\n'));
  expect(b.digest).not.toBe(x.digest);
 });
 it('checks submitted digest rather than silently accepting spoofed hashes',async()=>{
  const x=await inspectQuarantineCandidate(input());
  await expect(inspectQuarantineCandidate({...input(),expectedSha256:x.digest})).resolves.toMatchObject({digest:x.digest});
  await expect(inspectQuarantineCandidate({...input(),expectedSha256:'a'.repeat(64)})).rejects.toThrow('INTAKE_DIGEST_MISMATCH');
 });
 it('blocks cross-organization identifiers, traversal, active formats, binary and oversize',async()=>{
  await expect(inspectQuarantineCandidate({...input(),organizationId:'../other'})).rejects.toThrow('INTAKE_INVALID_SCOPE');
  for(const name of ['../bad.txt','bad\\name.txt','.hidden.txt','bad.html','bad.txt/extra','bad\n.txt'])
    await expect(inspectQuarantineCandidate(input('safe',name))).rejects.toThrow('INTAKE_NAME_OR_FORMAT_REJECTED');
  await expect(inspectQuarantineCandidate({...input(),bytes:new Uint8Array(MAX_INTAKE_BYTES+1)})).rejects.toThrow('INTAKE_SIZE_REJECTED');
  await expect(inspectQuarantineCandidate(input('<!doctype html><html>evil</html>'))).rejects.toThrow('INTAKE_UNSAFE_TEXT');
  await expect(inspectQuarantineCandidate(input('<script>alert(1)</script>'))).rejects.toThrow('INTAKE_UNSAFE_TEXT');
  await expect(inspectQuarantineCandidate({...input(),bytes:new Uint8Array([0xff])})).rejects.toThrow('INTAKE_INVALID_UTF8');
  await expect(inspectQuarantineCandidate({...input(),bytes:new Uint8Array([37,80,68,70,45])})).rejects.toThrow('INTAKE_CONTENT_KIND_MISMATCH');
 });
 it('requires PDF/DOCX signatures, but leaves full archive safety to future parser',async()=>{
  const raw= new TextEncoder().encode('fake PDF');
  await expect(inspectQuarantineCandidate({...input(),filename:'test.pdf',kind:'pdf',bytes:raw})).rejects.toThrow('INTAKE_CONTENT_KIND_MISMATCH');
  const bytes=new Uint8Array([37,80,68,70,45,49,46,55]);
  await expect(inspectQuarantineCandidate({...input(),filename:'test.pdf',kind:'pdf',bytes})).resolves.toMatchObject({kind:'pdf',status:'quarantine-only'});
  const docx=new Uint8Array([80,75,3,4,0]);
  await expect(inspectQuarantineCandidate({...input(),filename:'test.docx',kind:'docx',bytes:docx})).resolves.toMatchObject({kind:'docx',published:false});
 });
 it('allows narrowly pinned public official source URLs, with no network requests',()=>{
  expect(validateOfficialSourceUrl('https://api.congress.gov/v3/bill/118/hr/1')).toBe('https://api.congress.gov/v3/bill/118/hr/1');
  expect(validateOfficialSourceUrl('https://www.govinfo.gov/content/pkg/USCODE-2024-title28/')).toBe('https://www.govinfo.gov/content/pkg/USCODE-2024-title28/');
 });
 it('rejects lookalikes, private IPs, credentials, query secrets, invalid protocols and redirect tricks',()=>{
  for(const url of [
   'http://api.congress.gov/v3/bill/1','https://api.congress.gov.evil.test/',
   'https://api.congress.gov@127.0.0.1/latest','https://127.0.0.1/',
   'https://169.254.169.254/latest/meta-data/','https://localhost/',
   'https://[::1]/','ftp://www.govinfo.gov/',
   'https://www.govinfo.gov:444/', 'https://www.govinfo.gov/?token=secret',
   'https://www.govinfo.gov/#x', 'https://www.govinfo.gov/%2e%2e/admin',
   'https://www.govinfo.gov/%2F%2Fattacker','https://www.govinfo.gov\\@evil.test',
   'https://www.govinfo.gov%40evil.test', 'https://www.govinfo.gov/../../admin'
  ]) expect(()=>validateOfficialSourceUrl(url)).toThrow('SOURCE_URL_UNTRUSTED');
 });
});
