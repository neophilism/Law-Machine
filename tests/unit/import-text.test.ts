import {describe,it,expect} from 'vitest';
import {importText} from '../../packages/legislation/src/import-text.ts';
const enc=new TextEncoder();
describe('LM-009 bounded source import',()=>{
 it('retains exact source bytes separately from extracted text and numbering',async()=>{
  const bytes=enc.encode('# Chapter\r\nSection 2 Intro\r\n(a) First\r\n(b) Second');
  const r=await importText(bytes,{format:'markdown',name:'toy.md'});
  expect(r.extractedText).toContain('Section 2 Intro');
  expect(r.numbering.map(n=>n.label)).toEqual(['Chapter','2','a','b']);
  bytes[0]=0;
  expect(r.originalBytes[0]).toBe(35);
  expect(r.sourceDigest).toHaveLength(64);
 });
 it('distinguishes raw byte identity from normalized reading view',async()=>{
  const a=await importText(enc.encode('Section 1 A\n'),{format:'text',name:'a.txt'});
  const b=await importText(enc.encode('Section 1 A\r\n'),{format:'text',name:'a.txt'});
  expect(a.sourceDigest).not.toBe(b.sourceDigest);
 });
 it('rejects binary, invalid UTF8 and excessive inputs',async()=>{
  await expect(importText(new Uint8Array([0xff]),{format:'text',name:'bad.txt'})).rejects.toThrow();
  await expect(importText(enc.encode('a\0b'),{format:'text',name:'bad.txt'})).rejects.toThrow('BINARY_TEXT_NOT_SUPPORTED');
  await expect(importText(new Uint8Array(2_000_001),{format:'text',name:'big.txt'})).rejects.toThrow('SOURCE_SIZE_LIMIT');
  await expect(importText(enc.encode('x'),{format:'html' as never,name:'x'})).rejects.toThrow('UNSUPPORTED_SOURCE_FORMAT');
 });
});
