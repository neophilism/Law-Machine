import { sha256Hex } from '../../contracts/src/integrity.ts';

/** LM-010: constrained ingestion of two distinct official legislative XML families. */
export type LegislativeFamily = 'uslm' | 'house-bill-dtd';
export type LegislativeProvision = {
  readonly id: string;
  readonly parentId: string | null;
  readonly tag: string;
  readonly depth: number;
  readonly citation: string | null;
  readonly heading: string | null;
  readonly text: string;
  readonly startOffset: number;
  readonly endOffset: number;
};
export type LegislativeXmlImport = {
  readonly name: string;
  readonly family: LegislativeFamily;
  readonly sourceDigest: string;
  readonly originalBytes: Uint8Array;
  readonly extractedText: string;
  readonly provisions: readonly LegislativeProvision[];
  readonly diagnostics: readonly { code:string; message:string }[];
};
const decode=new TextDecoder('utf-8',{fatal:true});
const USLM_NS='http://xml.house.gov/schemas/uslm/1.0';
const structure=new Set(['title','subtitle','chapter','part','subpart','division','section','subsection','paragraph','subparagraph','clause','subclause','item','subitem']);
const bodyTags=new Set(['main','body','legis-body']);
function entityDecode(value:string):string {
  if(/&(?!(?:amp|lt|gt|quot|apos|#(?:x[0-9a-fA-F]+|[0-9]+));)/.test(value))throw Error('XML_ENTITY_UNSUPPORTED');
  return value.replace(/&([^;]{1,32});/g,(_,value:string)=>{
    const names:Record<string,string>={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};
    if(Object.hasOwn(names,value))return names[value]!;
    if(/^#(?:x[0-9a-fA-F]+|[0-9]+)$/.test(value)){
      const code=value[1]==='x'?parseInt(value.slice(2),16):parseInt(value.slice(1),10);
      if(code>=32&&code<=0x10ffff&&!(code>=0xd800&&code<=0xdfff))return String.fromCodePoint(code);
    }
    throw Error('XML_ENTITY_UNSUPPORTED');
  });
}
type Building={id:string;parentId:string|null;tag:string;depth:number;startOffset:number;order:number;label:string;heading:string;text:string};
const safeTag=(tag:string)=>tag.includes(':')?tag.split(':').at(-1)!:tag;
/**
 * The parser never loads an external DTD/entity, performs network requests,
 * executes embedded content, or accepts an entity expansion declaration.
 * A known House external DTD identifier is metadata only, never resolved.
 */
export async function importLegislativeXML(bytes:Uint8Array,options:{name:string}):Promise<LegislativeXmlImport>{
  if(!(bytes instanceof Uint8Array)||bytes.length>5_000_000||bytes.length===0)throw Error('XML_SIZE_LIMIT');
  if(typeof options?.name!=='string'||!options.name||options.name.length>200||/[\/\\\x00-\x1f]/.test(options.name))throw Error('INVALID_SOURCE_NAME');
  const original=bytes.slice();
  const xml=decode.decode(original);
  if(/<!ENTITY\b|<!\[CDATA\b|<!\[|<\s*(?:xi:include|script|iframe)\b/i.test(xml))throw Error('XML_UNSAFE_CONTENT');
  const dtd=xml.match(/<!DOCTYPE[\s\S]*?>/i);
  if(xml.includes('<!DOCTYPE')&&!dtd)throw Error('XML_UNSAFE_DTD');
  if(dtd&&!/^<!DOCTYPE\s+bill\s+(?:SYSTEM\s+["'](?:bill\.dtd|https?:\/\/xml\.house\.gov\/[^"']{1,120}\.dtd)["']|PUBLIC\s+["'][^"']{1,160}["']\s+["'](?:bill\.dtd|https?:\/\/xml\.house\.gov\/[^"']{1,120}\.dtd)["'])\s*>$/i.test(dtd[0]))throw Error('XML_UNSAFE_DTD');
  const body=xml.replace(/^\uFEFF/,'').replace(/^\s*<\?xml\s[^?]*\?>/i,'').replace(dtd?.[0]??'','').trimStart();
  const root=/^<([A-Za-z_][\w:.-]*)(?:\s([^<>]*))?>/.exec(body);
  if(!root)throw Error('XML_ROOT_UNSUPPORTED');
  const rootTag=safeTag(root[1]!);
  const rootAttrs=root[2]??'';
  const family:LegislativeFamily=rootAttrs.includes(USLM_NS)&&['bill','law','publicLaw','statute'].includes(rootTag)
    ?'uslm'
    :(rootTag==='bill'&&!rootAttrs.includes('xmlns=')&&/<legis-body(?:\s|>)/.test(xml))?'house-bill-dtd'
    :(()=>{throw Error('XML_FAMILY_UNSUPPORTED');})();
  if(family==='house-bill-dtd'&&dtd===null) {
    // Allow unpublished House-format drafts without a DTD file, but never infer an official version.
  }
  const parts:LegislativeProvision[]=[];
  const tags:string[]=[];
  const active:Building[]=[];
  const seen=new Set<string>();
  let tokenCount=0, matched=0, serial=0;
  const token=/<[^>]*>|[^<]+/g;
  let match:RegExpExecArray|null;
  while((match=token.exec(xml))!==null){
    const value=match[0]!,offset=match.index;
    matched+=value.length;
    if(++tokenCount>140000)throw Error('XML_COMPLEXITY_LIMIT');
    if(!value.startsWith('<')){
      if(active.length){
        const node=active.at(-1)!;
        const text=entityDecode(value);
        if(tags.includes('num')||tags.includes('enum'))node.label+=text;
        else if(tags.includes('heading')||tags.includes('header'))node.heading+=text;
        else node.text+=text;
      }
      continue;
    }
    if(value.startsWith('<?xml') || value===dtd?.[0] || (value.startsWith('<!--')&&value.endsWith('-->')))continue;
    if(value.startsWith('<!')||value.startsWith('<?'))throw Error('XML_UNSAFE_CONTENT');
    const closing=/^<\s*\//.test(value),selfClosing=/\/\s*>$/.test(value);
    const name=/^<\s*\/?\s*([A-Za-z_][\w:.-]*)/.exec(value)?.[1];
    if(!name)throw Error('XML_MALFORMED');
    const tag=safeTag(name);
    if(!closing){
      if(tags.length>=100)throw Error('XML_COMPLEXITY_LIMIT');
      const inBody=tags.some(t=>bodyTags.has(t));
      tags.push(tag);
      if(inBody&&structure.has(tag)){
        const idMatch=/\s(?:id|eId)=["']([A-Za-z][A-Za-z0-9_.:-]{0,127})["']/.exec(value);
        const id=idMatch?.[1]??'xml-node-'+(++serial);
        if(seen.has(id))throw Error('XML_DUPLICATE_ID');
        seen.add(id);
        active.push({id,parentId:active.at(-1)?.id??null,tag,depth:active.length+1,startOffset:offset,order:parts.length+active.length,label:'',heading:'',text:''});
      }
    }
    if(closing||selfClosing){
      if(tags.pop()!==tag)throw Error('XML_MALFORMED');
      if(structure.has(tag)&&active.at(-1)?.tag===tag){
        const n=active.pop()!;
        const citation=n.label.trim()||null,heading=n.heading.trim()||null,bodyText=n.text.replace(/\s+/g,' ').trim();
        const text=[citation,heading,bodyText].filter(Boolean).join(' ');
        parts.push({id:n.id,parentId:n.parentId,tag,depth:n.depth,citation,heading,text,startOffset:n.startOffset,endOffset:offset+value.length});
      }
    }
  }
  if(matched!==xml.length||tags.length||active.length)throw Error('XML_MALFORMED');
  if(!parts.length)throw Error('XML_NO_PROVISIONS');
  parts.sort((a,b)=>a.startOffset-b.startOffset);
  const warnings: {code:string;message:string}[]=[];
  if(parts.some(p=>p.citation===null))warnings.push({code:'MISSING_DISPLAY_CITATION',message:'Unnumbered provisions require explicit editorial citation review'});
  return {name:options.name,family,sourceDigest:await sha256Hex(original),originalBytes:original,
    extractedText:parts.map(p=>p.text).filter(Boolean).join('\n'),provisions:parts,diagnostics:warnings};
}
