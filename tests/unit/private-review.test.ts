import {describe,it,expect} from 'vitest';
import {preparePrivateSourceReview} from '../../packages/legislation/src/private-review.ts';
import type {IntakeRequest} from '../../packages/legislation/src/source-intake.ts';

const org='11111111-1111-4111-8111-111111111111';
const document='22222222-2222-4222-8222-222222222222';
const candidate=(text:string,kind:'text'|'markdown'='text'):IntakeRequest=>({
 organizationId:org,documentId:document,filename:kind==='text'?'fictional.txt':'fictional.md',
 kind,bytes:new TextEncoder().encode(text)
});
describe('LM-044 private extraction review cannot publish or impersonate official law',()=>{
 it('retains exact text and digest for editorial inspection only',async()=>{
  const r=await preparePrivateSourceReview(candidate('Section 1. Imaginary law\r\n(a) Example'));
  expect(r.extractedText).toBe('Section 1. Imaginary law\r\n(a) Example');
  expect(r.candidate.status).toBe('quarantine-only');
  expect(r.status).toBe('private-editorial-review-required');
  expect(r.substantiveLegalAuthorityVerified).toBe(false);
  expect(r.readyForRuleCompiler).toBe(false);
  expect(r.readyForPublication).toBe(false);
  expect(r.diagnostics).toEqual(expect.arrayContaining(['SOURCE_AUTHENTICITY_UNVERIFIED','EDITOR_REVIEW_REQUIRED']));
  expect((r as unknown as Record<string,unknown>).originalBytes).toBeUndefined();
  expect(r.candidate.digest).toMatch(/^[a-f0-9]{64}$/);
 });
 it('uses bounded actual Markdown importer and preserves review-only status',async()=>{
  const r=await preparePrivateSourceReview(candidate('# Fictional chapter\nSection 3 fake', 'markdown'));
  expect(r.extractedText).toContain('Section 3 fake');
  expect(r.readyForPublication).toBe(false);
 });
 it('never accepts manipulated digest or spoofed PDF, unsafe markup or unsupported XML',async()=>{
  const f=candidate('Section 1. Fictional');
  await expect(preparePrivateSourceReview({...f,expectedSha256:'a'.repeat(64)})).rejects.toThrow('PRIVATE_SOURCE_EXTRACTION_FAILED');
  await expect(preparePrivateSourceReview({...f,kind:'pdf',filename:'file.pdf'})).rejects.toThrow('PRIVATE_SOURCE_EXTRACTION_FAILED');
  await expect(preparePrivateSourceReview(candidate('<script>alert(1)</script>'))).rejects.toThrow('PRIVATE_SOURCE_EXTRACTION_FAILED');
  await expect(preparePrivateSourceReview({...f,kind:'xml',filename:'draft.xml'})).rejects.toThrow('PRIVATE_SOURCE_EXTRACTION_FAILED');
 });
 it('does not expose content-bearing parser exception details',async()=>{
  const f=candidate('secret text');
  await expect(preparePrivateSourceReview({...f,filename:'../private.txt'})).rejects.toThrow('PRIVATE_SOURCE_EXTRACTION_FAILED');
  await expect(preparePrivateSourceReview({...f,bytes:new Uint8Array([0xff])})).rejects.toThrow('PRIVATE_SOURCE_EXTRACTION_FAILED');
 });
});
