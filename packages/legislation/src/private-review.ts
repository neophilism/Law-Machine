import {importText} from './import-text.ts';
import {importDocx} from './import-docx.ts';
import {importLegislativeXML} from './import-xml.ts';
import {importPdf} from './import-pdf.ts';
import {inspectQuarantineCandidate,type IntakeRequest,type QuarantineCandidate} from './source-intake.ts';

/**
 * Private in-process extraction review only. Never return source bytes or
 * an executable model. Do not call from public routes or unauthenticated code.
 */
export type PrivateSourceReview={
 readonly candidate:QuarantineCandidate;
 readonly status:'private-editorial-review-required';
 readonly extractedText:string;
 readonly diagnostics:readonly string[];
 readonly substantiveLegalAuthorityVerified:false;
 readonly readyForRuleCompiler:false;
 readonly readyForPublication:false;
};

export async function preparePrivateSourceReview(request:IntakeRequest):Promise<PrivateSourceReview>{
 // Snapshot caller-owned data first: changing a buffer concurrently cannot cause
 // a hash/extraction mismatch or an unreviewed second version to be accepted.
 if(!request||!(request.bytes instanceof Uint8Array))throw Error('PRIVATE_SOURCE_INPUT_INVALID');
 const bytes=request.bytes.slice();
 let candidate:QuarantineCandidate,extractedText='',notes:string[]=[];
 try{
  candidate=await inspectQuarantineCandidate({...request,bytes});
  if(request.kind==='text'||request.kind==='markdown'){
   const result=await importText(bytes,{format:request.kind,name:request.filename});
   if(result.sourceDigest!==candidate.digest)throw Error('PRIVATE_SOURCE_DIGEST_INCONSISTENT');
   extractedText=result.extractedText;
   notes=result.diagnostics.map(d=>d.code);
  }else if(request.kind==='docx'){
   const result=await importDocx(bytes,{name:request.filename});
   if(result.sourceDigest!==candidate.digest)throw Error('PRIVATE_SOURCE_DIGEST_INCONSISTENT');
   extractedText=result.extractedText;
   notes=result.diagnostics.map(d=>d.code);
  }else if(request.kind==='xml'){
   const result=await importLegislativeXML(bytes,{name:request.filename});
   if(result.sourceDigest!==candidate.digest)throw Error('PRIVATE_SOURCE_DIGEST_INCONSISTENT');
   extractedText=result.extractedText;
   notes=result.diagnostics.map(d=>d.code);
  }else if(request.kind==='pdf'){
   const result=await importPdf(bytes,{name:request.filename});
   if(result.sourceDigest!==candidate.digest)throw Error('PRIVATE_SOURCE_DIGEST_INCONSISTENT');
   extractedText=result.pages.map(page=>page.text).join('\n');
   notes=[...result.diagnostics,...result.pages.flatMap(p=>p.diagnostics)];
   if(result.pages.some(p=>p.quality!=='extracted-unverified'))notes.push('PDF_REVIEW_REQUIRED');
  }else throw Error('PRIVATE_SOURCE_FORMAT_UNSUPPORTED');
 }catch{
  // Do not expose source excerpts, detailed parser traces or private paths.
  throw Error('PRIVATE_SOURCE_EXTRACTION_FAILED');
 }
 if(extractedText.length>500_000)throw Error('PRIVATE_SOURCE_REVIEW_SIZE_LIMIT');
 return {
  candidate,status:'private-editorial-review-required',extractedText,
  diagnostics:[...new Set(['SOURCE_AUTHENTICITY_UNVERIFIED','EDITOR_REVIEW_REQUIRED',...notes])],
  substantiveLegalAuthorityVerified:false,readyForRuleCompiler:false,
  readyForPublication:false
 };
}
