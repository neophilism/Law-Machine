import { describe, it, expect } from 'vitest';
import { deflateRawSync } from 'node:zlib';
import { importDocx } from '../../packages/legislation/src/import-docx.ts';
const encoder=new TextEncoder();
const xml=`<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Section 1 &amp; purpose</w:t></w:r></w:p>
<w:p><w:pPr><w:numPr><w:ilvl w:val="1"/><w:numId w:val="42"/></w:numPr></w:pPr><w:r><w:t>(a) Preserve source</w:t></w:r></w:p>
<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Agency</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Duty</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t>Desk A</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Forward &lt;copy&gt;</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
</w:body></w:document>`;
type Entry={name:string;body:string;method?:0|8;forcedSize?:number;forcedCrc?:number};
const crc32=(bytes:Uint8Array)=>{let crc=0xffffffff;for(const b of bytes){crc^=b;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;};
function zip(entries:Entry[]):Uint8Array{
  const bytes:number[]=[];const central:number[]=[];
  const word=(dest:number[],x:number)=>{dest.push(x&255,(x>>>8)&255);};
  const dword=(dest:number[],x:number)=>{word(dest,x);word(dest,x>>>16);};
  for(const entry of entries){
    const name=encoder.encode(entry.name),plain=encoder.encode(entry.body);
    const method=entry.method??0;
    const payload=method===8?new Uint8Array(deflateRawSync(plain)):plain;
    const offset=bytes.length;
    const crc=entry.forcedCrc??crc32(plain), size=entry.forcedSize??plain.length;
    dword(bytes,0x04034b50);word(bytes,20);word(bytes,0x800);word(bytes,method);word(bytes,0);word(bytes,0);
    dword(bytes,crc);dword(bytes,payload.length);dword(bytes,size);
    word(bytes,name.length);word(bytes,0);bytes.push(...name,...payload);
    dword(central,0x02014b50);word(central,20);word(central,20);word(central,0x800);word(central,method);
    word(central,0);word(central,0);dword(central,crc);dword(central,payload.length);dword(central,size);
    word(central,name.length);word(central,0);word(central,0);word(central,0);word(central,0);dword(central,0);dword(central,offset);
    central.push(...name);
  }
  const cdStart=bytes.length;
  bytes.push(...central);
  dword(bytes,0x06054b50);word(bytes,0);word(bytes,0);word(bytes,entries.length);word(bytes,entries.length);
  dword(bytes,central.length);dword(bytes,cdStart);word(bytes,0);
  return new Uint8Array(bytes);
}
const fixture=(method:0|8=8)=>zip([{name:'[Content_Types].xml',body:'<Types/>'},{name:'word/document.xml',body:xml,method}]);
describe('LM-009 DOCX bounds, fidelity and security',()=>{
  for(const method of [0,8] as const){
    it('extracts headings, clauses, and table cells with intact raw bytes, method '+method,async()=>{
      const bytes=fixture(method),before=bytes.slice();
      const doc=await importDocx(bytes,{name:'example.docx'});
      expect(doc.sourceDigest).toMatch(/^[0-9a-f]{64}$/);
      expect(doc.format).toBe('docx');
      expect(doc.extractedText).toContain('Section 1 & purpose');
      expect(doc.extractedText).toContain('(a) Preserve source');
      expect(doc.extractedText).toContain('Agency\tDuty');
      expect(doc.extractedText).toContain('Desk A\tForward <copy>');
      expect(doc.numbering).toEqual(expect.arrayContaining([
        expect.objectContaining({label:'Heading1',depth:1}),
        expect.objectContaining({label:'numId:42',depth:2})
      ]));
      bytes[0]=0;
      expect(doc.originalBytes).toEqual(before);
      expect(doc.extractedText).not.toContain('<w:');
    });
  }
  it('changes byte identity for a different archive without silently normalizing original',async()=>{
    const a=await importDocx(fixture(0),{name:'a.docx'});
    const b=await importDocx(fixture(8),{name:'a.docx'});
    expect(a.sourceDigest).not.toBe(b.sourceDigest);
    expect(a.extractedText).toBe(b.extractedText);
  });
  it('blocks ZIP traversal, duplicate paths and declared expansion bombs',async()=>{
    await expect(importDocx(zip([{name:'../word/document.xml',body:xml}]),{name:'x.docx'})).rejects.toThrow('DOCX_ZIP_PATH');
    await expect(importDocx(zip([{name:'word/document.xml',body:xml},{name:'word/document.xml',body:xml}]),{name:'x.docx'})).rejects.toThrow('DOCX_ZIP_PATH');
    await expect(importDocx(zip([{name:'word/document.xml',body:'ok',forcedSize:7_000_000}]),{name:'x.docx'})).rejects.toThrow('DOCX_EXPANSION_LIMIT');
  });
  it('rejects corrupted compressed data, tampered CRC, unknown and active markup',async()=>{
    const bad=zip([{name:'word/document.xml',body:xml,forcedCrc:0}]);
    await expect(importDocx(bad,{name:'x.docx'})).rejects.toThrow('DOCX_ZIP_CRC');
    const macro=zip([{name:'word/document.xml',body:xml},{name:'word/vbaProject.bin',body:'unsafe'}]);
    await expect(importDocx(macro,{name:'x.docx'})).rejects.toThrow('DOCX_ACTIVE_CONTENT');
    const dtd=zip([{name:'word/document.xml',body:'<!DOCTYPE foo><w:document/>'}]);
    await expect(importDocx(dtd,{name:'x.docx'})).rejects.toThrow('DOCX_ACTIVE_CONTENT');
    const active=zip([{name:'word/document.xml',body:'<w:document><w:altChunk/></w:document>'}]);
    await expect(importDocx(active,{name:'x.docx'})).rejects.toThrow('DOCX_ACTIVE_CONTENT');
  });
  it('rejects invalid filenames, missing part, overlong archives and malformed XML',async()=>{
    await expect(importDocx(fixture(),{name:'../a.docx'})).rejects.toThrow('INVALID_SOURCE_NAME');
    await expect(importDocx(zip([{name:'word/other.xml',body:'ok'}]),{name:'x.docx'})).rejects.toThrow('DOCX_DOCUMENT_MISSING');
    await expect(importDocx(new Uint8Array(6_000_001),{name:'x.docx'})).rejects.toThrow('DOCX_ARCHIVE_SIZE');
    await expect(importDocx(zip([{name:'word/document.xml',body:'<w:document><w:body><w:p></w:document>'}]),{name:'x.docx'})).rejects.toThrow('DOCX_XML_INVALID');
  });
});
