import { canonicalDigest, canonicalJSON } from '../../contracts/src/integrity.ts';

/** Explicitly optional: official metadata is not law, and no key is required for fixture mode. */
export type OfficialQuery =
  | { provider:'congress'; congress:number; billType:'hr'|'s'|'hjres'|'sjres'|'hres'|'sres'|'hconres'|'sconres'; billNumber:number }
  | { provider:'govinfo'; packageId:string };
export type OfficialSnapshot={
  readonly provider:OfficialQuery['provider'];
  readonly identifier:string;
  readonly sourceUrl:string;
  readonly sourceDigest:string;
  readonly retrievedAt:string|null;
  readonly mode:'fixture'|'live';
  readonly data:Record<string,unknown>;
};
export function officialEndpoint(query:OfficialQuery):{url:string;id:string}{
  if(query.provider==='congress'){
    if(!Number.isInteger(query.congress)||query.congress<1||query.congress>999 ||
      !Number.isInteger(query.billNumber)||query.billNumber<1||query.billNumber>999999 ||
      !['hr','s','hjres','sjres','hres','sres','hconres','sconres'].includes(query.billType))throw Error('METADATA_INVALID_IDENTIFIER');
    const id=query.congress+'/'+query.billType+'/'+query.billNumber;
    return {url:'https://api.congress.gov/v3/bill/'+id+'?format=json',id};
  }
  if(query.provider==='govinfo'){
    if(typeof query.packageId!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(query.packageId))throw Error('METADATA_INVALID_IDENTIFIER');
    return {url:'https://api.govinfo.gov/packages/'+encodeURIComponent(query.packageId)+'/summary',id:query.packageId};
  }
  throw Error('METADATA_UNSUPPORTED_PROVIDER');
}
/** Limit the decoded HTTP body before JSON parsing. Never log URLs with secrets. */
async function boundedJSON(response:Response):Promise<Record<string,unknown>>{
  if(!response.ok)throw Error('METADATA_REMOTE_STATUS');
  const len=response.headers.get('content-length');
  if(len&&Number(len)>250_000)throw Error('METADATA_RESPONSE_LIMIT');
  if(!response.body)throw Error('METADATA_RESPONSE_EMPTY');
  const reader=response.body.getReader();
  const chunks:Uint8Array[]=[];let length=0;
  while(true){
    const next=await reader.read();
    if(next.done)break;
    length+=next.value.length;
    if(length>250_000){await reader.cancel();throw Error('METADATA_RESPONSE_LIMIT');}
    chunks.push(next.value);
  }
  const bytes=new Uint8Array(length);let at=0;
  for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}
  let data:unknown;
  try{data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw Error('METADATA_RESPONSE_INVALID');}
  if(!data||typeof data!=='object'||Array.isArray(data)||Object.getPrototypeOf(data)!==Object.prototype)throw Error('METADATA_RESPONSE_INVALID');
  return data as Record<string,unknown>;
}
export async function loadOfficialMetadata(
  query:OfficialQuery,
  options:{fixtureCache?:ReadonlyMap<string,Record<string,unknown>>; fetcher?:typeof fetch; apiKey?:string; timeoutMs?:number}={}
):Promise<OfficialSnapshot>{
  const {url,id}=officialEndpoint(query),cacheKey=query.provider+':'+id;
  const fixture=options.fixtureCache?.get(cacheKey);
  const snapshot=(data:Record<string,unknown>,mode:'fixture'|'live'):Promise<OfficialSnapshot>=>{
    // Detached plain JSON snapshot: the caller cannot mutate a cached provider response.
    const copy=JSON.parse(canonicalJSON(data)) as Record<string,unknown>;
    return canonicalDigest(copy).then(sourceDigest=>({provider:query.provider,identifier:id,sourceUrl:url,sourceDigest,
      retrievedAt:mode==='live'?new Date().toISOString():null,mode,data:copy}));
  };
  if(fixture)return snapshot(fixture,'fixture');
  if(!options.apiKey)throw Error('METADATA_CREDENTIAL_NOT_CONFIGURED');
  if(!/^[A-Za-z0-9_-]{8,128}$/.test(options.apiKey))throw Error('METADATA_INVALID_CREDENTIAL');
  const timeout=options.timeoutMs??5000;
  if(!Number.isInteger(timeout)||timeout<100||timeout>10000)throw Error('METADATA_INVALID_TIMEOUT');
  const fetcher=options.fetcher??fetch;
  // Official govinfo/congress.gov use api.data.gov credentials. URL keys must never appear in
  // logs, public releases, diagnostic messages, or returned sourceUrl.
  const remote=new URL(url);remote.searchParams.set('api_key',options.apiKey);
  try{
    const response=await fetcher(remote.toString(),{method:'GET',headers:{Accept:'application/json'},
      signal:AbortSignal.timeout(timeout),redirect:'error',cache:'no-store',credentials:'omit'});
    return snapshot(await boundedJSON(response),'live');
  }catch(error){
    if(error instanceof Error&&error.message.startsWith('METADATA_'))throw error;
    throw Error('METADATA_FETCH_FAILED');
  }
}
