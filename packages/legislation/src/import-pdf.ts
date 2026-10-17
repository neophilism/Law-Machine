import { sha256Hex } from '../../contracts/src/integrity.ts';

/**
 * Conservative, bounded PDF text adapter. Never interpret unverified extraction
 * as operative legal language. Unsupported font encodings need correction.
 * This is a deliberately limited subset, NOT a complete PDF renderer.
 */
export type PdfPage = {
  readonly page: number; readonly objectId: number; readonly text: string;
  readonly quality: 'extracted-unverified'|'scanned-or-image'|'unsupported';
  readonly diagnostics: readonly string[];
};
export type ImportedPdf = {
  readonly name:string; readonly originalBytes:Uint8Array; readonly sourceDigest:string;
  readonly pages: readonly PdfPage[]; readonly diagnostics:readonly string[];
};
type ObjectRec={id:number;body:string};
const latin=new TextDecoder('latin1');
// WHATWG 'latin1' is Windows-1252: it corrupts binary 0x80-0x9f in streams.
function binaryString(bytes:Uint8Array):string {
  const chunks:string[]=[];
  for(let i=0;i<bytes.length;i+=8192)chunks.push(String.fromCharCode(...bytes.subarray(i,i+8192)));
  return chunks.join('');
}
const MAX_BYTES=6_000_000;
const MAX_DECOMPRESSED=4_000_000;
const LIMIT_PAGES=150;
async function streamContent(body:string):Promise<string|null>{
  const start=/\bstream\r?\n/.exec(body);
  if(!start)return null;
  const at=start.index+start[0].length;
  const until=body.indexOf('endstream',at);
  if(until<0)throw Error('PDF_STREAM_MALFORMED');
  let raw=body.slice(at,until);
  raw=raw.replace(/\r?\n$/,'');
  if(raw.length>MAX_DECOMPRESSED)throw Error('PDF_STREAM_LIMIT');
  let bytes=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i)&255;
  if(/\/Filter\s*\[/.test(body)||/\/Filter\s*\/(?!FlateDecode\b)/.test(body))throw Error('PDF_FILTER_UNSUPPORTED');
  if(/\/Filter\s*\/FlateDecode\b/.test(body)){
    try{
      const stream=new ReadableStream<BufferSource>({start(c){c.enqueue(bytes);c.close();}});
      const reader=stream.pipeThrough(new DecompressionStream('deflate')).getReader();
      const chunks:Uint8Array[]=[];let total=0;
      while(true){
        const r=await reader.read();if(r.done)break;
        total+=r.value.length;
        if(total>MAX_DECOMPRESSED){await reader.cancel();throw Error('PDF_STREAM_LIMIT');}
        chunks.push(r.value);
      }
      bytes=new Uint8Array(total);let p=0;for(const chunk of chunks){bytes.set(chunk,p);p+=chunk.length;}
    }catch(e){if(e instanceof Error && e.message==='PDF_STREAM_LIMIT')throw e;throw Error('PDF_STREAM_DECOMPRESSION');}
  }
  return latin.decode(bytes);
}
function pdfLiteral(literal:string):{text:string;uncertain:boolean}{
  // A PDF literal string is byte-oriented. Interpret ASCII only without an
  // explicit font CMap; all extracted text remains non-operative until reviewed.
  let text='',uncertain=false;
  for(let i=0;i<literal.length;i++){
    let c=literal[i]!;
    if(c==='\\'){
      const next=literal[++i];if(next===undefined)throw Error('PDF_STRING_MALFORMED');
      const escapes:Record<string,string>={n:'\n',r:'\r',t:'\t',b:'\b',f:'\f'};
      if(/[0-7]/.test(next)){
        let digits=next;
        for(let count=0;count<2&&/[0-7]/.test(literal[i+1]??'');count++)digits+=literal[++i];
        c=String.fromCharCode(parseInt(digits,8));
      }else c=escapes[next]??next;
    }
    if(c.charCodeAt(0)>127)uncertain=true;
    text+=c;
  }
  return {text,uncertain};
}
function extractOperators(stream:string):{text:string;diagnostics:string[]}{
  const values:string[]=[];const diagnostics:string[]=[];
  const blocks=[...stream.matchAll(/\bBT([\s\S]*?)\bET/g)];
  if(blocks.length>20000)throw Error('PDF_OPERATOR_LIMIT');
  for(const [,block] of blocks){
    const tokens:string[]=[];
    for(const match of block!.matchAll(/\(((?:\\.|[^\\()])*)\)\s*Tj\b|\[([\s\S]*?)\]\s*TJ\b/g)){
      if(match[1]!==undefined)tokens.push(match[1]);
      else for(const inner of match[2]!.matchAll(/\(((?:\\.|[^\\()])*)\)/g))tokens.push(inner[1]!);
    }
    if(/[<][0-9A-Fa-f]+[>]\s*Tj/.test(block!))diagnostics.push('HEX_STRING_UNSUPPORTED');
    if(tokens.length){
      const parts=tokens.map(t=>pdfLiteral(t));
      values.push(parts.map(p=>p.text).join(''));
      if(parts.some(p=>p.uncertain))diagnostics.push('FONT_ENCODING_UNVERIFIED');
    }else diagnostics.push('TEXT_OPERATOR_UNSUPPORTED');
  }
  const xs=[...stream.matchAll(/(-?\d+(?:\.\d+)?)\s+-?\d+(?:\.\d+)?\s+Td\b/g)].map(m=>Number(m[1]));
  if(xs.some(x=>Math.abs(x)>250)&&xs.some(x=>Math.abs(x)<100))diagnostics.push('POSSIBLE_MULTICOLUMN');
  return {text:values.join('\n'),diagnostics:[...new Set(diagnostics)]};
}
/** Safe first-pass extraction that always preserves the original printable PDF. */
export async function importPdf(bytes:Uint8Array,options:{name:string}):Promise<ImportedPdf>{
  if(!(bytes instanceof Uint8Array)||bytes.length<20||bytes.length>MAX_BYTES)throw Error('PDF_SIZE_LIMIT');
  if(typeof options?.name!=='string'||!options.name.toLowerCase().endsWith('.pdf')||options.name.length>200||
    /[\/\\\x00-\x1f]/.test(options.name))throw Error('INVALID_SOURCE_NAME');
  const original=bytes.slice(),source=binaryString(original);
  if(!/^%PDF-(?:1|2)\.\d/.test(source)||!/%%EOF\s*$/.test(source))throw Error('PDF_MALFORMED');
  if(/\/Encrypt\b/.test(source))throw Error('PDF_ENCRYPTED_UNSUPPORTED');
  const objects=new Map<number,ObjectRec>();
  const pattern=/(?:^|[\r\n])(\d{1,8})\s+0\s+obj\b([\s\S]*?)\bendobj\b/g;
  let m:RegExpExecArray|null;
  while((m=pattern.exec(source))!==null){
    const id=Number(m[1]);
    if(objects.has(id))throw Error('PDF_DUPLICATE_OBJECT');
    if(objects.size>10000)throw Error('PDF_OBJECT_LIMIT');
    objects.set(id,{id,body:m[2]!});
  }
  const pageObjects=[...objects.values()].filter(x=>/\/Type\s*\/Page\b/.test(x.body));
  if(pageObjects.length===0||pageObjects.length>LIMIT_PAGES)throw Error('PDF_PAGE_LIMIT');
  const pages:PdfPage[]=[];const diagnostics:string[]=[];
  for(const [index,page] of pageObjects.entries()){
    const match=/\/Contents\s*(\d{1,8})\s+0\s+R/.exec(page.body);
    const list=/\/Contents\s*\[([^\]]+)\]/.exec(page.body);
    const ids=match?[Number(match[1])]:list?[...list[1]!.matchAll(/(\d{1,8})\s+0\s+R/g)].map(v=>Number(v[1])):[];
    if(ids.length>20)throw Error('PDF_STREAM_LIMIT');
    const warnings:string[]=[];let text='';
    for(const id of ids){
      const object=objects.get(id);
      if(!object){warnings.push('CONTENT_REFERENCE_MISSING');continue;}
      const stream=await streamContent(object.body);
      if(stream===null){warnings.push('CONTENT_STREAM_MISSING');continue;}
      const parsed=extractOperators(stream);
      text+=(text&&parsed.text?'\n':'')+parsed.text;
      warnings.push(...parsed.diagnostics);
    }
    const image=/\/Subtype\s*\/Image\b/.test(source)||/\/Im\d+\s+Do\b/.test(text);
    const quality=text?'extracted-unverified':image?'scanned-or-image':'unsupported';
    if(!text)warnings.push(image?'SCANNED_OR_IMAGE_ONLY':'NO_EXTRACTABLE_TEXT');
    pages.push({page:index+1,objectId:page.id,text,quality,diagnostics:[...new Set(warnings)]});
  }
  diagnostics.push('PAGE_ORDER_UNVERIFIED');
  return {name:options.name,originalBytes:original,sourceDigest:await sha256Hex(original),pages,diagnostics};
}
/** A correction is distinct from extraction and never modifies the original PDF bytes. */
export function reviewedPdfCorrection(document:ImportedPdf,page:number,correctedText:string,reviewer:string){
  if(!Number.isSafeInteger(page)||page<1||page>document.pages.length)throw Error('PDF_CORRECTION_PAGE_INVALID');
  if(typeof correctedText!=='string'||correctedText.length>100000||!correctedText.trim()||
     typeof reviewer!=='string'||reviewer.trim().length<2||reviewer.length>200)throw Error('PDF_CORRECTION_INVALID');
  return {sourceDigest:document.sourceDigest,page,correctedText,reviewer,reviewed:true as const};
}
/** Optional OCR engine MUST run in a separately sandboxed worker; results remain untrusted. */
export interface IsolatedOcrPort{
  recognize(request:{page:number;sourceBytes:Uint8Array}):Promise<{text:string;confidence:number}>;
}
export async function suggestPdfOcr(document:ImportedPdf,page:number,port?:IsolatedOcrPort){
  if(!Number.isSafeInteger(page)||page<1||page>document.pages.length)throw Error('PDF_OCR_PAGE_INVALID');
  if(!port)return {status:'unavailable' as const,reason:'OCR_NOT_CONFIGURED'};
  const result=await port.recognize({page,sourceBytes:document.originalBytes.slice()});
  if(!result||typeof result.text!=='string'||result.text.length>100000||!Number.isFinite(result.confidence)||
     result.confidence<0||result.confidence>1)throw Error('PDF_OCR_RESULT_INVALID');
  return {status:'unverified' as const,page,text:result.text,confidence:result.confidence,
    requiresEditorialCorrection:true as const};
}
