import {describe,it,expect} from 'vitest';
import {importText} from '../../packages/legislation/src/import-text.ts';
import {normalizeSource} from '../../packages/legislation/src/provision-tree.ts';
import {projectAmendments} from '../../packages/legislation/src/amendments.ts';
import type {AmendmentInstruction} from '../../packages/legislation/src/amendments.ts';
const enc=new TextEncoder();
async function model(){
  return normalizeSource('toy-baseline',await importText(enc.encode('Section 1 Original\nSection 2 Second'),{format:'text',name:'toy.txt'}));
}
describe('LM-015 source-pinned amendatory projection',()=>{
  it('inserts, replaces, repeals and renumbers without modifying pinned baseline bytes',async()=>{
    const baseline=await model();
    const sourceDigest=baseline.sourceDigest,versionId=baseline.versionId;
    const target=baseline.provisions[0]!.id,second=baseline.provisions[1]!.id;
    const mk=(id:string,operation:AmendmentInstruction['operation'],targetProvisionId:string,extra:Partial<AmendmentInstruction>={}):AmendmentInstruction=>({
      id,operation,baselineVersionId:versionId,baselineSourceDigest:sourceDigest,
      targetProvisionId,amendatorySourceId:'draft-bill-s1',...extra
    });
    const instructions:AmendmentInstruction[]=[
      mk('a01','insert',target,{newProvisionId:'s1-new',newCitation:'1A',text:'A new idea (fictional).'}),
      mk('a02','replace',target,{text:'Section 1 Replacement',after:['a01']}),
      mk('a03','renumber',target,{newCitation:'4',after:['a02']}),
      mk('a04','repeal',second),
    ];
    const before=JSON.stringify(baseline);
    const result=projectAmendments(baseline,instructions);
    expect(result.status).toBe('projected-consolidation');
    expect(result.projectedProvisions.map(p=>p.citation)).toEqual(['4','1A','2']);
    expect(result.projectedProvisions[2]!.repealed).toBe(true);
    expect(result.projectedProvisions[0]!.text).toContain('Replacement');
    expect(result.projectedProvisions[1]!.origin).toBe('reconstructed');
    expect(result.orderedInstructions.map(i=>i.id)).toEqual(['a01','a02','a03','a04']);
    expect(JSON.stringify(baseline)).toBe(before);
    expect(result.label).toContain('not an official source');
  });
  it('holds a conflicted baseline unchanged until precedence is explicitly resolved',async()=>{
    const b=await model(),p=b.provisions[0]!.id;
    const mk=(id:string):AmendmentInstruction=>({id,operation:'replace',baselineVersionId:b.versionId,
      baselineSourceDigest:b.sourceDigest,targetProvisionId:p,amendatorySourceId:'draft',text:id});
    const result=projectAmendments(b,[mk('x'),mk('y')]);
    expect(result.status).toBe('unresolved');
    expect(result.diagnostics.map(e=>e.code)).toContain('AMENDMENT_CONFLICT_UNRESOLVED');
    expect(result.projectedProvisions[0]!.text).toBe(b.provisions[0]!.text);
  });
  it('blocks targets missing from the exact pinned baseline version and source digest',async()=>{
    const b=await model();
    const change:AmendmentInstruction={id:'x',operation:'repeal',baselineVersionId:'wrong',
      baselineSourceDigest:b.sourceDigest,targetProvisionId:b.provisions[0]!.id,amendatorySourceId:'draft'};
    expect(projectAmendments(b,[change]).diagnostics.map(e=>e.code)).toContain('AMENDMENT_SOURCE_MISMATCH');
    const wrong={...change,baselineVersionId:b.versionId,targetProvisionId:'missing'};
    expect(projectAmendments(b,[wrong]).diagnostics.map(e=>e.code)).toContain('AMENDMENT_TARGET_MISSING');
  });
  it('rejects ambiguous dependency graphs, cycles and duplicate inserted IDs',async()=>{
    const b=await model();
    const target=b.provisions[0]!.id;
    const mk=(id:string,after:string[]):AmendmentInstruction=>({
      id,operation:'insert',baselineVersionId:b.versionId,baselineSourceDigest:b.sourceDigest,
      targetProvisionId:target,amendatorySourceId:'draft',newProvisionId:'new-provision',
      newCitation:'1A',text:'Inserted',after
    });
    const result=projectAmendments(b,[mk('first',['second']),mk('second',['first'])]);
    expect(result.status).toBe('unresolved');
    expect(result.diagnostics.map(d=>d.code)).toEqual(expect.arrayContaining(['AMENDMENT_PRECEDENCE_CYCLE','AMENDMENT_INSERT_COLLISION']));
  });
  it('does not create a definitive projection by editing an already repealed provision',async()=>{
    const b=await model(),target=b.provisions[0]!.id;
    const base={baselineVersionId:b.versionId,baselineSourceDigest:b.sourceDigest,targetProvisionId:target,amendatorySourceId:'draft'};
    const result=projectAmendments(b,[{id:'r',operation:'repeal',...base},{id:'x',operation:'replace',text:'Impossible',after:['r'],...base}]);
    expect(result.status).toBe('unresolved');
    expect(result.diagnostics.map(d=>d.code)).toContain('AMENDMENT_REPEALED_TARGET');
  });
});
