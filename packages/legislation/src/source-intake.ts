import {sha256Hex} from '../../contracts/src/integrity.ts';

/** LM-044 preparation: validation produces ONLY a private quarantine candidate. */
export type IntakeKind='text'|'markdown'|'xml'|'docx'|'pdf';
export type IntakeRequest={
 readonly organizationId:string;
 readonly documentId:string;
 readonly filename:string;
 readonly kind:IntakeKind;
 readonly bytes:Uint8Array;
 readonly expectedSha256?:string;
};
export type QuarantineCandidate={
 readonly organizationId:string;
 readonly documentId:string;
 readonly filename:string;
 readonly kind:IntakeKind;
 readonly digest:string;
 readonly bytesCount:number;
 readonly privateObjectKey:string;
 readonly status:'quarantine-only';
 readonly published:false;
};
export const MAX_INTAKE_BYTES=15_000_000;
const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const HEX=/^[a-f0-9]{64}$/;
const kinds:Readonly<Record<IntakeKind,string>>={
 text:'.txt',markdown:'.md',xml:'.xml',docx:'.docx',pdf:'.pdf'
};
export async function inspectQuarantineCandidate(input:IntakeRequest):Promise<QuarantineCandidate>{
 if(!input||!UUID.test(input.organizationId)||!UUID.test(input.documentId))
  throw Error('INTAKE_INVALID_SCOPE');
 if(!(input.bytes instanceof Uint8Array)||input.bytes.length===0||
    input.bytes.length>MAX_INTAKE_BYTES)throw Error('INTAKE_SIZE_REJECTED');
 const ext=kinds[input.kind];
 if(!ext||typeof input.filename!=='string'||input.filename.length<3||
    input.filename.length>200||!input.filename.toLowerCase().endsWith(ext)||
    /[\/\\\x00-\x1f\x7f]/.test(input.filename)||
    /^\.|\.\.|[. ]$/.test(input.filename))throw Error('INTAKE_NAME_OR_FORMAT_REJECTED');
 const bytes=input.bytes;
 // Active content is never executed. This is preliminary type sanity only;
 // a separate isolated parser/antivirus must complete before leaving quarantine.
 const head=Array.from(bytes.slice(0,8));
 const pdf=head.slice(0,5).join(',')==='37,80,68,70,45';
 const zip=head.slice(0,4).join(',')==='80,75,3,4';
 if((input.kind==='pdf'&&!pdf)||(input.kind==='docx'&&!zip)||
    ((input.kind==='text'||input.kind==='markdown'||input.kind==='xml')&&(pdf||zip)))
    throw Error('INTAKE_CONTENT_KIND_MISMATCH');
 if(input.kind==='text'||input.kind==='markdown'||input.kind==='xml'){
  let text:string;
  try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{
   throw Error('INTAKE_INVALID_UTF8');
  }
  if(text.includes('\0')||/^\s*(?:<!doctype\s+html|<html\b|<script\b)/i.test(text))
    throw Error('INTAKE_UNSAFE_TEXT');
 }
 const digest=await sha256Hex(bytes);
 if(input.expectedSha256!==undefined&&(!HEX.test(input.expectedSha256)||input.expectedSha256!==digest))
  throw Error('INTAKE_DIGEST_MISMATCH');
 return {organizationId:input.organizationId,documentId:input.documentId,
   filename:input.filename,kind:input.kind,digest,bytesCount:bytes.length,
   privateObjectKey:'quarantine/'+input.organizationId.toLowerCase()+'/sha256/'+digest,
   status:'quarantine-only',published:false};
}

/**
 * Preflight for a FUTURE separately authenticated server-side importer.
 * Does not fetch URLs or verify DNS, redirects, TLS certificates or source authenticity.
 * DNS rebinding, proxy settings and every redirect MUST be checked by a network-isolated
 * fetcher before any live import is enabled.
 */
const OFFICIAL_HOSTS=new Set([
 'www.congress.gov','api.congress.gov','www.govinfo.gov','api.govinfo.gov',
 'uscode.house.gov','www.ecfr.gov'
]);
export function validateOfficialSourceUrl(candidate:unknown):string{
 if(typeof candidate!=='string'||candidate.length<12||candidate.length>2048||
    /[\x00-\x20\x7f\\]/.test(candidate)||
    /%(?:2e|2f|5c|00|25)|(?:^|\/)\.\.(?:\/|$)/i.test(candidate))throw Error('SOURCE_URL_UNTRUSTED');
 let url:URL;
 try{url=new URL(candidate);}catch{throw Error('SOURCE_URL_UNTRUSTED');}
 if(url.protocol!=='https:'||!OFFICIAL_HOSTS.has(url.hostname)||
    url.username||url.password||url.port||url.hash||
    url.search||url.pathname.length>1600||
    /%(?:2e|2f|5c|00|25)/i.test(url.pathname)||url.pathname.includes('..'))
    throw Error('SOURCE_URL_UNTRUSTED');
 return url.toString();
}
