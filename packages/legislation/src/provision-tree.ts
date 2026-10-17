import { canonicalJSON } from '../../contracts/src/integrity.ts';
import type { ImportedSource } from './import-text.ts';
import type { LegislativeXmlImport } from './import-xml.ts';
import type { ImportedPdf } from './import-pdf.ts';

/** Canonical normalized source tree; not a validated legal interpretation. */
export type SourceSpan={
  readonly kind:'line'|'utf16-offset'|'page';
  readonly start:number; readonly end:number;
};
export type NormalizedProvision={
  readonly id:string; readonly versionId:string; readonly sourceDigest:string;
  readonly parentId:string|null; readonly citation:string|null;
  readonly text:string; readonly span:SourceSpan;
  readonly status:'extracted-unverified'|'unresolved'|'unsupported';
  readonly proposedDefinitions:readonly string[];
  readonly proposedCrossRefs:readonly string[];
};
export type NormalizedDocument={
  readonly versionId:string; readonly format:'text'|'markdown'|'docx'|'xml-uslm'|'xml-house-bill-dtd'|'pdf';
  readonly sourceDigest:string; readonly sourceName:string;
  readonly provisions:readonly NormalizedProvision[];
  readonly diagnostics:readonly {code:string;path:string}[];
};
const versionPattern=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const hex=/^[0-9a-f]{64}$/;
function semanticCandidates(text:string){
  // Candidates are NOT authoritative definitions or resolved legal cross-references.
  const proposedDefinitions=[...text.matchAll(/["“]([^"”]{1,80})["”]\s+(?:means|shall mean)\b/gi)].slice(0,30).map(m=>m[1]!);
  const proposedCrossRefs=[...text.matchAll(/(?:§|section)\s+\d+(?:\.\d+)*(?:\([a-z0-9]+\))*/gi)].slice(0,30).map(m=>m[0]!);
  return {proposedDefinitions,proposedCrossRefs};
}
export function normalizeSource(versionId:string,input:ImportedSource|LegislativeXmlImport|ImportedPdf):NormalizedDocument{
  if(!versionPattern.test(versionId)||!input||!hex.test(input.sourceDigest))throw Error('NORMALIZATION_INVALID_SOURCE');
  const provisions:NormalizedProvision[]=[];
  const diagnostics:{code:string;path:string}[]=[];
  const add=(id:string,parentId:string|null,citation:string|null,text:string,span:SourceSpan,status:NormalizedProvision['status'])=>{
    if(!versionPattern.test(id))throw Error('NORMALIZATION_INVALID_IDENTIFIER');
    provisions.push({id,versionId,sourceDigest:input.sourceDigest,parentId,citation,text,span,status,...semanticCandidates(text)});
  };
  let format:NormalizedDocument['format'];
  if('pages' in input){
    format='pdf';
    for(const page of input.pages)add('pdf-page-'+page.page,null,'page '+page.page,page.text,
      {kind:'page',start:page.page,end:page.page},page.quality==='unsupported'?'unsupported':page.quality==='scanned-or-image'?'unresolved':'extracted-unverified');
    if(input.pages.some(p=>p.quality!=='extracted-unverified'))diagnostics.push({code:'PDF_SOURCE_REQUIRES_REVIEW',path:'$.pages'});
  }else if('family' in input){
    format=input.family==='uslm'?'xml-uslm':'xml-house-bill-dtd';
    for(const p of input.provisions)add(p.id,p.parentId,p.citation,p.text,
      {kind:'utf16-offset',start:p.startOffset,end:p.endOffset},'extracted-unverified');
    for(const warning of input.diagnostics)diagnostics.push({code:warning.code,path:'$'});
  }else{
    format=input.format;
    const lines=input.extractedText.split(/\r\n|\r|\n/);
    const numbered=[...input.numbering].sort((a,b)=>a.line-b.line);
    const parents:{depth:number;id:string}[]=[];
    for(let i=0;i<numbered.length;i++){
      const item=numbered[i]!,next=numbered[i+1];
      if(!Number.isSafeInteger(item.line)||item.line<1||item.line>lines.length)throw Error('NORMALIZATION_INVALID_LINE');
      const end=Math.min(lines.length,(next?.line??(lines.length+1))-1);
      const text=lines.slice(item.line-1,end).join('\n');
      const depth=item.depth;
      if(!Number.isInteger(depth)||depth<1||depth>20)throw Error('NORMALIZATION_INVALID_DEPTH');
      while(parents.length&&parents.at(-1)!.depth>=depth)parents.pop();
      const parentId=parents.at(-1)?.id??null;
      const id='src-'+item.line+'-'+(i+1);
      add(id,parentId,item.label,text,{kind:'line',start:item.line,end},input.diagnostics.some(d=>d.code==='NUMBERING_LABEL_UNRESOLVED')?'unresolved':'extracted-unverified');
      parents.push({depth,id});
    }
    if(!numbered.length){
      add('src-body',null,null,input.extractedText,{kind:'line',start:1,end:Math.max(1,lines.length)},'unresolved');
      diagnostics.push({code:'NO_STRUCTURAL_NUMBERING',path:'$.numbering'});
    }
    for(const warning of input.diagnostics)diagnostics.push({code:warning.code,path:'$'});
  }
  const keys=new Set<string>();
  const byId=new Map(provisions.map(p=>[p.id,p]));
  for(let i=0;i<provisions.length;i++){
    const p=provisions[i]!;
    if(keys.has(p.id))diagnostics.push({code:'DUPLICATE_PROVISION_ID',path:'$.provisions['+i+'].id'});
    keys.add(p.id);
    if(p.parentId!==null&&!byId.has(p.parentId))diagnostics.push({code:'MISSING_PARENT',path:'$.provisions['+i+'].parentId'});
    if(p.citation!==null&&provisions.some((s,j)=>j<i&&s.parentId===p.parentId&&s.citation===p.citation))
      diagnostics.push({code:'DUPLICATE_SECTION_LABEL',path:'$.provisions['+i+'].citation'});
    if(!p.text.trim())diagnostics.push({code:'EMPTY_PROVISION',path:'$.provisions['+i+'].text'});
  }
  return {versionId,format,sourceDigest:input.sourceDigest,sourceName:input.name,provisions,diagnostics};
}
/** Persistence exports a deterministic JSON record only. Original raw bytes stay separate/private. */
export function serializeSource(document:NormalizedDocument):string{
  return canonicalJSON(document);
}
export function parseStoredSource(json:string):NormalizedDocument{
  if(typeof json!=='string'||json.length>6_000_000)throw Error('STORED_SOURCE_LIMIT');
  let data:unknown;
  try{data=JSON.parse(json);}catch{throw Error('STORED_SOURCE_INVALID');}
  if(!data||typeof data!=='object'||Array.isArray(data))throw Error('STORED_SOURCE_INVALID');
  const record=data as Record<string,unknown>;
  if(!versionPattern.test(String(record.versionId))||typeof record.sourceDigest!=='string'||!hex.test(record.sourceDigest)||
     !Array.isArray(record.provisions)||record.provisions.length>10000)throw Error('STORED_SOURCE_INVALID');
  return JSON.parse(canonicalJSON(record)) as NormalizedDocument;
}
/** A new pinned version cannot overwrite another publication or prior citation. */
export class VersionedSourceStore {
  private readonly records=new Map<string,string>();
  put(source:NormalizedDocument):void{
    const snapshot=serializeSource(source);
    const previous=this.records.get(source.versionId);
    if(previous&&previous!==snapshot)throw Error('VERSION_IMMUTABLE');
    this.records.set(source.versionId,snapshot);
  }
  get(versionId:string):NormalizedDocument|null{
    const data=this.records.get(versionId);
    return data?parseStoredSource(data):null;
  }
  versions():string[]{return [...this.records.keys()].sort();}
}
/** Public explorer export is explicitly authorized; no private source bytes or paths. */
export function publishExplorer(source:NormalizedDocument,authorized:boolean){
  if(authorized!==true)throw Error('PUBLICATION_NOT_AUTHORIZED');
  if(source.diagnostics.some(d=>['MISSING_PARENT','DUPLICATE_PROVISION_ID','DUPLICATE_SECTION_LABEL'].includes(d.code)))
    throw Error('SOURCE_STRUCTURE_INVALID');
  return {versionId:source.versionId,sourceDigest:source.sourceDigest,format:source.format,
    provisions:source.provisions.map(p=>({id:p.id,parentId:p.parentId,citation:p.citation,text:p.text,span:p.span,status:p.status}))};
}
