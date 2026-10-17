import type { NormalizedDocument, NormalizedProvision } from './provision-tree.ts';
import { VersionedSourceStore } from './provision-tree.ts';

/** LM-013 pinned, exact normalized-text citation; never silently redirects across versions. */
export type ExactAnchor={
  readonly versionId:string; readonly sourceDigest:string;
  readonly provisionId:string; readonly quote:string;
};
export type CitationDiagnostic='SOURCE_VERSION_UNAVAILABLE'|'SOURCE_DIGEST_CHANGED'|
  'PROVISION_NOT_FOUND'|'EXACT_QUOTE_CHANGED'|'AMBIGUOUS_CITATION'|'INVALID_ANCHOR';
export type ResolvedCitation={
  readonly status:'resolved'|'stale'|'unavailable'|'ambiguous';
  readonly versionId:string; readonly sourceDigest:string; readonly provisionId:string|null;
  readonly quote:string|null; readonly excerpt:string|null;
  readonly sourceSpan:NormalizedProvision['span']|null;
  readonly officialLink:string|null;
  readonly diagnostic:CitationDiagnostic|null;
  readonly editorialStatus:NormalizedProvision['status']|null;
};
const id=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const digest=/^[0-9a-f]{64}$/;
function officialUrl(value:string|undefined,span:NormalizedProvision['span']|null):string|null{
  if(!value)return null;
  try{
    const u=new URL(value);
    if(u.protocol!=='https:'||u.username||u.password||!['www.govinfo.gov','www.congress.gov','congress.gov'].includes(u.hostname)||
      u.port||u.searchParams.has('api_key'))return null;
    u.search='';u.hash='';
    if(span?.kind==='page')u.hash='#page='+span.start;
    return u.toString();
  }catch{return null;}
}
function status(anchor:ExactAnchor,kind:ResolvedCitation['status'],reason:CitationDiagnostic|null,
  provision:NormalizedProvision|null,link:string|null):ResolvedCitation{
  const quote=kind==='resolved'?anchor.quote:null;
  const text=provision?.text??'';
  const at=quote?text.indexOf(quote):-1;
  const excerpt=at<0?null:text.slice(Math.max(0,at-100),Math.min(text.length,at+quote!.length+100));
  return {status:kind,versionId:anchor.versionId,sourceDigest:anchor.sourceDigest,
    provisionId:provision?.id??null,quote,excerpt,sourceSpan:provision?.span??null,
    officialLink:kind==='resolved'?link:null,diagnostic:reason,editorialStatus:provision?.status??null};
}
/** Caller must pin the exact version/digest from an independently verified source. */
export function resolveCitation(
  document:NormalizedDocument,anchor:ExactAnchor,options:{published?:boolean;officialSourceUrl?:string}={}
):ResolvedCitation{
  if(options.published!==true)throw Error('CITATION_PUBLICATION_NOT_AUTHORIZED');
  if(!id.test(anchor.versionId)||!id.test(anchor.provisionId)||!digest.test(anchor.sourceDigest)||
    typeof anchor.quote!=='string'||!anchor.quote||anchor.quote.length>2000)throw Error('CITATION_INVALID_ANCHOR');
  if(document.versionId!==anchor.versionId)return status(anchor,'unavailable','SOURCE_VERSION_UNAVAILABLE',null,null);
  if(document.sourceDigest!==anchor.sourceDigest)return status(anchor,'stale','SOURCE_DIGEST_CHANGED',null,null);
  const provision=document.provisions.find(p=>p.id===anchor.provisionId)??null;
  if(!provision)return status(anchor,'unavailable','PROVISION_NOT_FOUND',null,null);
  if(!provision.text.includes(anchor.quote))return status(anchor,'stale','EXACT_QUOTE_CHANGED',provision,null);
  return status(anchor,'resolved',null,provision,officialUrl(options.officialSourceUrl,provision.span));
}
/** Read from the requested historical version; newer versions never silently substitute. */
export function resolveVersionedCitation(
  versions:VersionedSourceStore,anchor:ExactAnchor,options:{published?:boolean;officialSourceUrl?:string}
):ResolvedCitation{
  if(options.published!==true)throw Error('CITATION_PUBLICATION_NOT_AUTHORIZED');
  const saved=versions.get(anchor.versionId);
  if(!saved)return status(anchor,'unavailable','SOURCE_VERSION_UNAVAILABLE',null,null);
  return resolveCitation(saved,anchor,options);
}
/** Displayed section numbers are not guaranteed unique, including across versions. */
export function locateDisplayedCitation(document:NormalizedDocument,citation:string):{
  status:'found'|'missing'|'ambiguous';provisionId:string|null
}{
  if(typeof citation!=='string'||citation.length>256||!citation.trim())throw Error('CITATION_INVALID_LABEL');
  const matches=document.provisions.filter(p=>p.citation===citation);
  if(matches.length===0)return {status:'missing',provisionId:null};
  if(matches.length>1)return {status:'ambiguous',provisionId:null};
  return {status:'found',provisionId:matches[0]!.id};
}
/** Content-only public inspector; never includes private source paths or upload bytes. */
export function publicCitationInspector(result:ResolvedCitation){
  return {status:result.status,versionId:result.versionId,sourceDigest:result.sourceDigest,
    provisionId:result.provisionId,quote:result.quote,excerpt:result.excerpt,
    span:result.sourceSpan,officialUrl:result.officialLink,
    sourceQuality:result.editorialStatus,diagnostic:result.diagnostic};
}
