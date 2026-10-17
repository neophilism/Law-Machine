import { describe,it,expect } from 'vitest';
import { deflateSync } from 'node:zlib';
import { importPdf, reviewedPdfCorrection, suggestPdfOcr } from '../../packages/legislation/src/import-pdf.ts';

/** A genuinely renderable, traditional-xref toy PDF generated inside the test. */
function makePdf(options:{compressed?:boolean; scanned?:boolean; columns?:boolean; twoPages?:boolean}={}):Uint8Array{
  const objects:string[]=[];
  const pages=options.twoPages?[3,6]:[3];
  const cat='<< /Type /Catalog /Pages 2 0 R >>';
  objects[1]=cat;
  objects[2]='<< /Type /Pages /Count '+pages.length+' /Kids ['+pages.map(id=>id+' 0 R').join(' ') + '] >>';
  const content=options.scanned?'q /Im1 Do Q':options.columns?
    'BT /F1 12 Tf 72 730 Td (First column) Tj 330 0 Td (Second column) Tj ET':
    'BT /F1 12 Tf 72 730 Td (Fictional claim) Tj ET';
  const compressed=options.compressed?new Uint8Array(deflateSync(new TextEncoder().encode(content))):null;
  const stream=compressed?String.fromCharCode(...compressed):content;
  objects[3]='<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>';
  objects[3]+=' >>';
  objects[4]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  objects[5]='<< /Length '+stream.length+(compressed?' /Filter /FlateDecode':'')+' >>\nstream\n'+stream+'\nendstream';
  if(options.twoPages){
    objects[6]='<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 7 0 R >>';
    objects[7]='<< /Length 45 >>\nstream\nBT /F1 12 Tf (Page two) Tj ET\nendstream';
  }
  if(options.scanned)objects[8]='<< /Type /XObject /Subtype /Image /Width 10 /Height 10 >>';
  let body='%PDF-1.4\n';const offsets:number[]=[0];
  for(let i=1;i<objects.length;i++){
    if(!objects[i]){offsets[i]=0;continue;}
    offsets[i]=body.length;
    body+=i+' 0 obj\n'+objects[i]+'\nendobj\n';
  }
  const xrefOffset=body.length, size=objects.length;
  body+='xref\n0 '+size+'\n0000000000 65535 f \n';
  for(let i=1;i<size;i++)body+=(offsets[i]??0).toString().padStart(10,'0')+' 00000 '+(objects[i]?'n':'f')+' \n';
  body+='trailer\n<< /Root 1 0 R /Size '+size+' >>\nstartxref\n'+xrefOffset+'\n%%EOF';
  return Uint8Array.from(body,c=>c.charCodeAt(0)&255);
}
describe('LM-011 bounded PDF import and correction',()=>{
  for(const compressed of [false,true]){
    it('extracts text with page/object anchors and preserves original bytes, compressed '+compressed,async()=>{
      const data=makePdf({compressed,twoPages:true});
      const before=data.slice();
      const result=await importPdf(data,{name:'toy.pdf'});
      expect(result.pages.map(p=>p.page)).toEqual([1,2]);
      expect(result.pages[0]!.objectId).toBe(3);
      expect(result.pages[0]!.text).toContain('Fictional claim');
      expect(result.pages[0]!.quality).toBe('extracted-unverified');
      expect(result.pages[1]!.text).toContain('Page two');
      expect(result.sourceDigest).toMatch(/^[0-9a-f]{64}$/);
      data[0]=0;expect(result.originalBytes).toEqual(before);
      const again=await importPdf(before,{name:'toy.pdf'});
      expect(again.sourceDigest).toEqual(result.sourceDigest);
    });
  }
  it('identifies scan-only and possible columns without inventing extracted text',async()=>{
    const scan=await importPdf(makePdf({scanned:true}),{name:'toy.pdf'});
    expect(scan.pages[0]!.quality).toBe('scanned-or-image');
    expect(scan.pages[0]!.diagnostics).toContain('SCANNED_OR_IMAGE_ONLY');
    const columns=await importPdf(makePdf({columns:true}),{name:'toy.pdf'});
    expect(columns.pages[0]!.diagnostics).toContain('POSSIBLE_MULTICOLUMN');
  });
  it('rejects malicious or unsupported PDFs and filters',async()=>{
    const valid=makePdf();
    await expect(importPdf(new Uint8Array(6_000_001),{name:'bad.pdf'})).rejects.toThrow('PDF_SIZE_LIMIT');
    await expect(importPdf(new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF'),{name:'x.pdf'})).rejects.toThrow('PDF_PAGE_LIMIT');
    await expect(importPdf(valid.slice(0,-5),{name:'bad.pdf'})).rejects.toThrow('PDF_MALFORMED');
    const encrypted=new TextEncoder().encode('%PDF-1.4\n/Encrypt 1 0 R\n%%EOF');
    await expect(importPdf(encrypted,{name:'x.pdf'})).rejects.toThrow('PDF_ENCRYPTED_UNSUPPORTED');
    const patched=new TextDecoder('latin1').decode(valid).replace('5 0 obj\n','5 0 obj\n');
    const invalid=Uint8Array.from((patched.replace('BT /F1','/Filter /DCTDecode BT /F1')),c=>c.charCodeAt(0));
    await expect(importPdf(invalid,{name:'bad.pdf'})).rejects.toThrow('PDF_FILTER_UNSUPPORTED');
  });
  it('requires explicit reviewer before a corrected passage can be marked reviewed',async()=>{
    const source=await importPdf(makePdf(),{name:'toy.pdf'});
    expect(()=>reviewedPdfCorrection(source,1,'Corrected interpretation','')).toThrow('PDF_CORRECTION_INVALID');
    const corrected=reviewedPdfCorrection(source,1,'Corrected source text','Editorial reviewer');
    expect(corrected).toMatchObject({reviewed:true,page:1,sourceDigest:source.sourceDigest});
    expect(source.pages[0]!.text).toContain('Fictional claim');
  });
  it('never invokes OCR implicitly and never promotes an OCR suggestion to operative text',async()=>{
    const source=await importPdf(makePdf({scanned:true}),{name:'toy.pdf'});
    expect(await suggestPdfOcr(source,1)).toEqual({status:'unavailable',reason:'OCR_NOT_CONFIGURED'});
    let calls=0;
    const result=await suggestPdfOcr(source,1,{async recognize({sourceBytes}){calls++;expect(sourceBytes).not.toBe(source.originalBytes);return{text:'uncertain read',confidence:0.8};}});
    expect(calls).toBe(1);
    expect(result).toMatchObject({status:'unverified',confidence:0.8,requiresEditorialCorrection:true});
  });
});
