/** LM-018: validate editorial scenario specifications without pretending unverified law is executable. */
export type PlannedScenario = {
 readonly id:string;readonly title:string;
 readonly classification:'planned-only'|'verified-model';
 readonly hypothetical:true;
 readonly verifiedLaw:boolean;
 readonly legislativeStatus:'proposed-unverified'|'draft'|'introduced'|'enacted';
 readonly sourceRefs:readonly string[];
 readonly baselineSnapshot:string|null;
 readonly expectedCheckpoints:readonly string[];
 readonly assumptions:readonly {id:string;classification:'hypothetical'|'evidence';verified:boolean}[];
 readonly unresolved:readonly string[];
};
export type PlannedPack={
 readonly schemaVersion:'law-machine-scenario-inventory-v1';
 readonly packId:string;
 readonly description:string;
 readonly status:'not-publishable'|'candidate';
 readonly sourceStatus:'original-bill-not-available'|'verified';
 readonly baselineStatus:'official-snapshots-not-collected'|'verified';
 readonly sourceInventory:readonly {id:string;origin:string;retrievedAt:string|null;digest:string|null;availability:'missing'|'verified';publicationStatus:string}[];
 readonly scenarios:readonly PlannedScenario[];
};
export type PackReadiness={
 readonly readyForExecution:boolean;
 readonly readyForPublication:boolean;
 readonly coverage:{readonly total:number;readonly sourceAnchored:number;readonly modelReady:number};
 readonly diagnostics:readonly string[];
};
const EXPECTED_IDS=[
 'complete-responsible','complete-wrong-agency','missed-routing','missing-amount',
 'late-deficiency-notice','correctable-defect','postal-transition','outage',
 'pro-se-court','denial-delivery-failure','protected-material','urgent','foia','phasing'
] as const;
const id=(v:unknown):v is string=>typeof v==='string'&&/^[a-z][a-z0-9-]{0,127}$/.test(v);
const validStringList=(x:unknown,min=0,max=100):x is string[]=>
 Array.isArray(x)&&x.length>=min&&x.length<=max&&x.every(id)&&new Set(x).size===x.length;
export function inspectFirstPack(candidate:unknown):PackReadiness{
 const errors:string[]=[];
 const fail=(s:string)=>{if(!errors.includes(s))errors.push(s);};
 if(!candidate||typeof candidate!=='object'||Array.isArray(candidate))
  return {readyForExecution:false,readyForPublication:false,
    coverage:{total:0,sourceAnchored:0,modelReady:0},diagnostics:['PACK_INVALID']};
 const pack=candidate as Partial<PlannedPack>;
 if(pack.schemaVersion!=='law-machine-scenario-inventory-v1'||!id(pack.packId)||
    typeof pack.description!=='string'||!pack.description.length||
    !['not-publishable','candidate'].includes(String(pack.status))||
    !Array.isArray(pack.scenarios)||pack.scenarios.length!==14)fail('PACK_INVALID');
 if(!Array.isArray(pack.scenarios)||pack.scenarios.length>100)
  return {readyForExecution:false,readyForPublication:false,
    coverage:{total:0,sourceAnchored:0,modelReady:0},diagnostics:['SCENARIOS_INVALID']};
 const seen=new Set<string>();
 let sourceAnchored=0,modelReady=0;
 for(const [n,s] of pack.scenarios.entries()){
  if(!s||!id(s.id)||seen.has(s.id)||!EXPECTED_IDS.includes(s.id as typeof EXPECTED_IDS[number])||
     typeof s.title!=='string'||!s.title.trim()||s.title.length>300||
     s.hypothetical!==true||typeof s.verifiedLaw!=='boolean'||
     !['planned-only','verified-model'].includes(String(s.classification))||
     !['proposed-unverified','draft','introduced','enacted'].includes(String(s.legislativeStatus))||
     !validStringList(s.expectedCheckpoints,2,100)||
     !validStringList(s.sourceRefs,0,100)||
     !Array.isArray(s.assumptions)||s.assumptions.length>100||
     !Array.isArray(s.unresolved)||s.unresolved.length>100||
     !s.unresolved.every(x=>typeof x==='string'&&x.length>0&&x.length<1000))
   fail('SCENARIO_INVALID:'+n);
  if(s?.id)seen.add(s.id);
  if(s?.sourceRefs?.length)sourceAnchored++;
  if(s?.classification==='verified-model'&&s?.verifiedLaw===true&&s?.sourceRefs?.length&&
     typeof s?.baselineSnapshot==='string'&&s?.baselineSnapshot)modelReady++;
 }
 if(seen.size!==EXPECTED_IDS.length || EXPECTED_IDS.some(x=>!seen.has(x)))fail('SCENARIO_SET_INCOMPLETE');
 const total=pack.scenarios.length;
 if(!Array.isArray(pack.sourceInventory)||pack.sourceInventory.length<2||
    pack.sourceInventory.some(s=>!s||!id(s.id)||!['missing','verified'].includes(s.availability)||
      !(s.digest===null||typeof s.digest==='string'&&/^[a-f0-9]{64}$/.test(s.digest))))
  fail('SOURCE_INVENTORY_INVALID');
 if(pack.sourceInventory?.some(s=>s.availability!=='verified'||!s.digest||!s.retrievedAt))fail('SOURCE_BYTES_OR_RETRIEVAL_NOT_VERIFIED');
 if(pack.sourceStatus!=='verified'||pack.baselineStatus!=='verified')
  fail('PINNED_SOURCES_NOT_VERIFIED');
 if(pack.scenarios.some(s=>s.classification==='planned-only'||s.verifiedLaw!==true||
      !s.sourceRefs.length||!s.baselineSnapshot))
  fail('SCENARIOS_NOT_SOURCE_READY');
 if(pack.status!=='candidate')fail('PUBLICATION_DISABLED');
 const ready=errors.length===0&&modelReady===14;
 return {readyForExecution:ready,readyForPublication:ready,
  coverage:{total,sourceAnchored,modelReady},diagnostics:errors};
}
