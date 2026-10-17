import { sha256Hex } from '../../contracts/src/integrity.ts';
import type { ImportedSource, Numbering, ImportDiagnostic } from './import-text.ts';

/**
 * Bounded, provider-free DOCX extractor. The original archive is never modified.
 * ZIP input, decompression and OOXML are treated as hostile data, never executed.
 * This extracts visible text; it does not claim to verify legal semantics.
 */
const MAX_ARCHIVE = 6_000_000;
const MAX_XML = 4_000_000;
const MAX_EXPANDED = 8_000_000;
const MAX_ENTRIES = 256;
const MAX_RATIO = 200;
const decoder = new TextDecoder('utf-8', { fatal:true });
type ZipEntry = { name: string; method:number; compressed:Uint8Array; size:number; crc:number };

function archiveEntries(data:Uint8Array): Map<string,ZipEntry> {
  if (!(data instanceof Uint8Array) || data.length < 22 || data.length > MAX_ARCHIVE) throw Error('DOCX_ARCHIVE_SIZE');
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const u16=(p:number)=>view.getUint16(p,true), u32=(p:number)=>view.getUint32(p,true);
  let end=-1;
  for(let p=data.length-22;p>=Math.max(0,data.length-65557);p--){
    if(u32(p)===0x06054b50 && p+22+u16(p+20)===data.length){end=p;break;}
  }
  if(end<0) throw Error('DOCX_ZIP_DIRECTORY');
  const count=u16(end+10), begin=u32(end+16), length=u32(end+12);
  if(u16(end+4)!==0 || u16(end+6)!==0 || u16(end+8)!==count || count>MAX_ENTRIES || begin===0xffffffff ||
    length===0xffffffff || count===0xffff || begin+length!==end) throw Error('DOCX_ZIP_DIRECTORY');
  const result=new Map<string,ZipEntry>();
  let cursor=begin,total=0;
  for(let i=0;i<count;i++){
    if(cursor+46> end || u32(cursor)!==0x02014b50) throw Error('DOCX_ZIP_ENTRY');
    const flags=u16(cursor+8),method=u16(cursor+10),crc=u32(cursor+16),compressedSize=u32(cursor+20),size=u32(cursor+24);
    const namelen=u16(cursor+28),extra=u16(cursor+30),comment=u16(cursor+32),offset=u32(cursor+42);
    if((flags & ~0x808)!==0 || (method!==0 && method!==8) || namelen===0 || namelen>256 ||
       size===0xffffffff || compressedSize===0xffffffff || offset===0xffffffff) throw Error('DOCX_ZIP_UNSUPPORTED');
    const finish=cursor+46+namelen+extra+comment;
    if(finish>end || offset+30>begin || u32(offset)!==0x04034b50) throw Error('DOCX_ZIP_ENTRY');
    const name=decoder.decode(data.subarray(cursor+46,cursor+46+namelen));
    if(name.startsWith('/') || name.includes('\\') || name.includes('\0') || name.includes(':') ||
       name.split('/').some(part=>part==='..'||part==='.') || name.length>256 || result.has(name)) throw Error('DOCX_ZIP_PATH');
    const lFlags=u16(offset+6),lMethod=u16(offset+8),localNameLen=u16(offset+26),localExtra=u16(offset+28);
    if(lFlags!==flags || lMethod!==method || localNameLen!==namelen ||
       decoder.decode(data.subarray(offset+30,offset+30+localNameLen))!==name) throw Error('DOCX_ZIP_ENTRY');
    const start=offset+30+localNameLen+localExtra;
    if(start>begin || compressedSize>begin-start) throw Error('DOCX_ZIP_ENTRY');
    if(size>MAX_EXPANDED || compressedSize>MAX_ARCHIVE || (compressedSize===0 && size>0) ||
      (compressedSize>0 && size>compressedSize*MAX_RATIO)) throw Error('DOCX_EXPANSION_LIMIT');
    total+=size;
    if(total>MAX_EXPANDED) throw Error('DOCX_EXPANSION_LIMIT');
    const unixMode=(u32(cursor+38)>>>16)&0xf000;
    if(unixMode===0xa000) throw Error('DOCX_ZIP_PATH'); // links are not supported
    if(!name.endsWith('/')){
      result.set(name,{name,method,compressed:data.subarray(start,start+compressedSize),size,crc});
    }
    cursor=finish;
  }
  if(cursor!==end) throw Error('DOCX_ZIP_DIRECTORY');
  return result;
}
function crc32(bytes:Uint8Array):number {
  let crc=0xffffffff;
  for(const b of bytes){crc^=b;for(let j=0;j<8;j++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  return (crc^0xffffffff)>>>0;
}
async function inflate(entry:ZipEntry):Promise<Uint8Array>{
  if(entry.method===0){
    if(entry.compressed.length!==entry.size || crc32(entry.compressed)!==entry.crc) throw Error('DOCX_ZIP_CRC');
    return entry.compressed.slice();
  }
  let reader:ReadableStreamDefaultReader<Uint8Array>;
  try{
    const stream=new ReadableStream<BufferSource>({start(controller){controller.enqueue(entry.compressed.slice());controller.close();}});
    reader=stream.pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  }catch{throw Error('DOCX_ZIP_DECOMPRESSION');}
  const chunks:Uint8Array[]=[];let total=0;
  try{
    while(true){
      const r=await reader.read();
      if(r.done)break;
      total+=r.value.byteLength;
      if(total>entry.size || total>MAX_EXPANDED) {await reader.cancel();throw Error('DOCX_EXPANSION_LIMIT');}
      chunks.push(r.value);
    }
  }catch(e){ if(e instanceof Error && e.message==='DOCX_EXPANSION_LIMIT')throw e;throw Error('DOCX_ZIP_DECOMPRESSION'); }
  if(total!==entry.size)throw Error('DOCX_ZIP_SIZE_MISMATCH');
  const bytes=new Uint8Array(total);
  let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}
  if(crc32(bytes)!==entry.crc)throw Error('DOCX_ZIP_CRC');
  return bytes;
}
function unescapeXML(value:string):string{
  // Validate references on the ORIGINAL string before decoding '&amp;' into '&'.
  if(/&(?!(?:amp|lt|gt|quot|apos|#(?:x[0-9a-fA-F]+|[0-9]+));)/.test(value))throw Error('DOCX_XML_ENTITY');
  return value.replace(/&([^;]{1,32});/g,(_all,entity:string)=>{
    const named:Record<string,string>={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};
    if(Object.hasOwn(named,entity))return named[entity]!;
    const numeric=/^#(x[0-9a-fA-F]+|[0-9]+)$/.exec(entity);
    if(numeric){
      const code=numeric[1]!.startsWith('x')?parseInt(numeric[1]!.slice(1),16):parseInt(numeric[1]!,10);
      if(code>0 && code<=0x10ffff && !(code>=0xd800&&code<=0xdfff) && (code>=32 || code===9||code===10||code===13))return String.fromCodePoint(code);
    }
    throw Error('DOCX_XML_ENTITY');
  });
}
function parseWordXML(xml:string):{text:string;numbering:Numbering[];diagnostics:ImportDiagnostic[]}{
  if(xml.length>MAX_XML || /<!DOCTYPE|<!ENTITY|<w:altChunk\b|<w:object\b|<o:OLEObject\b/i.test(xml))throw Error('DOCX_ACTIVE_CONTENT');
  const lines:string[]=[];
  const numbering:Numbering[]=[];
  const diagnostics:ImportDiagnostic[]=[];
  const stack:string[]=[];
  let paragraph:null|{text:string;style:string;level:number|null;numId:string|null}=null;
  let cell:string[]|null=null,row:string[]|null=null,tokens=0;
  const pattern=/<[^>]*>|[^<]+/g;
  let match:RegExpExecArray|null,consumed=0;
  const attribute=(tag:string,key:string):string|null=>{
    const result=new RegExp('(?:\\s|^)(?:w:)?'+key+'\\s*=\\s*["\']([^"\']*)["\']').exec(tag);
    return result?unescapeXML(result[1]!):null;
  };
  while((match=pattern.exec(xml))!==null){
    const token=match[0];consumed+=token.length;
    if(++tokens>100000)throw Error('DOCX_XML_COMPLEXITY');
    if(!token.startsWith('<')){
      if(paragraph&&stack.includes('w:t'))paragraph.text+=unescapeXML(token);
      continue;
    }
    if(token.startsWith('<?xml'))continue;
    if(token.startsWith('<!--') && token.endsWith('-->'))continue;
    const end=/^<\s*\//.test(token),self=/\/\s*>$/.test(token);
    const tag=/^<\s*\/?\s*([A-Za-z_][\w.:-]*)/.exec(token)?.[1];
    if(!tag)throw Error('DOCX_XML_INVALID');
    if(!end){
      if(stack.length>96)throw Error('DOCX_XML_COMPLEXITY');
      stack.push(tag);
      if(tag==='w:p'){
        if(paragraph)throw Error('DOCX_XML_INVALID');
        paragraph={text:'',style:'',level:null,numId:null};
      }else if(tag==='w:tr'){if(row!==null)throw Error('DOCX_XML_INVALID');row=[];}
      else if(tag==='w:tc'){if(cell!==null||row===null)throw Error('DOCX_XML_INVALID');cell=[];}
      else if(paragraph){
        if(tag==='w:pStyle')paragraph.style=attribute(token,'val')??'';
        else if(tag==='w:ilvl'){
          const v=attribute(token,'val');if(v!==null&&/^\d+$/.test(v))paragraph.level=Math.min(8,Number(v));
        }else if(tag==='w:numId')paragraph.numId=attribute(token,'val');
        else if(tag==='w:tab')paragraph.text+='\t';
        else if(tag==='w:br')paragraph.text+='\n';
      }
    }
    if(end||self){
      if(stack.pop()!==tag)throw Error('DOCX_XML_INVALID');
      if(tag==='w:p' && paragraph){
        const text=paragraph.text;
        if(text.trim()){
          if(cell!==null)cell.push(text);
          else lines.push(text);
          const line=lines.length+((cell!==null)?1:0);
          const heading=/^Heading([1-6])$/i.exec(paragraph.style);
          if(heading)numbering.push({line,label:paragraph.style,text,depth:Number(heading[1])});
          else if(paragraph.numId!==null){
            numbering.push({line,label:'numId:'+paragraph.numId,text,depth:(paragraph.level??0)+1});
            if(!diagnostics.some(d=>d.code==='NUMBERING_LABEL_UNRESOLVED'))diagnostics.push({code:'NUMBERING_LABEL_UNRESOLVED',line,message:'Word numbering identifier retained; displayed list markers require numbering style resolution'});
          }
        }
        paragraph=null;
      }else if(tag==='w:tc'&&cell!==null){row!.push(cell.join('\n'));cell=null;}
      else if(tag==='w:tr'&&row!==null){lines.push(row.join('\t'));row=null;}
    }
  }
  if(consumed!==xml.length||stack.length!==0||paragraph!==null||cell!==null||row!==null)throw Error('DOCX_XML_INVALID');
  if(!numbering.length)diagnostics.push({code:'NO_NUMBERING_DETECTED',line:1,message:'No explicit headings or list markers detected'});
  return {text:lines.join('\n'),numbering,diagnostics};
}
/** Original DOCX bytes plus extracted, bounded text. No external assets or active OOXML are loaded. */
export async function importDocx(bytes:Uint8Array,options:{name:string}):Promise<ImportedSource>{
  if(typeof options?.name!=='string'||!options.name.toLowerCase().endsWith('.docx')||options.name.length>200||
     /[\\/\x00-\x1f]/.test(options.name))throw Error('INVALID_SOURCE_NAME');
  const original=bytes.slice();
  const entries=archiveEntries(original);
  if([...entries.keys()].some(name=>/(?:^|\/)(?:vbaProject\.bin|activeX|embeddings)(?:\/|$)/i.test(name)))throw Error('DOCX_ACTIVE_CONTENT');
  const document=entries.get('word/document.xml');
  if(!document||document.size>MAX_XML)throw Error('DOCX_DOCUMENT_MISSING');
  const text=decoder.decode(await inflate(document));
  const parsed=parseWordXML(text);
  return {format:'docx',name:options.name,sourceDigest:await sha256Hex(original),originalBytes:original,
    extractedText:parsed.text,numbering:parsed.numbering,diagnostics:parsed.diagnostics};
}
