import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {sha256Hex} from '../../packages/contracts/src/integrity.ts';
import {firstComparisonBaselineInventory,resolveTemporalApplicability} from '../../packages/legislation/src/temporal.ts';
import type {BaselineSnapshot,ProposedFramework} from '../../packages/legislation/src/temporal.ts';

const fixture:BaselineSnapshot={id:'baseline-test',jurisdiction:'US-federal',agency:null,asOf:'2026-01-01',
  sources:[{id:'official-v1',title:'Toy official snapshot',versionLabel:'2026-01-01',
    jurisdiction:'US-federal',asOf:'2026-01-01',digest:'a'.repeat(64),
    sourceUrl:'https://www.govinfo.gov/app/details/USCODE-2024-title5',citation:'Toy fixture only',verified:true,digestScope:'curated-excerpt',excerptText:'Toy legal excerpt'}],
  gaps:[]};
const proposal:ProposedFramework={billVersionId:'bill-draft-1',status:'draft',enactedOn:null,
  changes:[{id:'routing',provisionId:'s1',sourceDigest:'b'.repeat(64),effectiveOn:'2026-07-01',
    transitionEndsOn:'2026-08-01',jurisdiction:'US-federal',agency:null,description:'Hypothetical routing'}]};
const asOf='2026-08-02',jurisdiction='US-federal';
describe('LM-014 baseline applicability',()=>{
  it('never treats a proposed bill as enacted by default regardless of simulation date',()=>{
    const result=resolveTemporalApplicability(fixture,proposal,{asOf,jurisdiction,compareProposal:true});
    expect(result.kind).toBe('proposed-not-enacted');
    expect(result.effectiveChanges).toEqual([]);
    expect(result.labels).toContain('Proposal is not enacted by default');
  });
  it('selects stages only under a clearly labeled explicit hypothetical enactment assumption',()=>{
    const common={jurisdiction,compareProposal:true,assumeEnactment:true};
    expect(resolveTemporalApplicability(fixture,proposal,{...common,asOf:'2026-06-30'}).futureChanges).toEqual(['routing']);
    const transition=resolveTemporalApplicability(fixture,proposal,{...common,asOf:'2026-07-01'});
    expect(transition.transitionChanges).toEqual(['routing']);
    expect(transition.kind).toBe('hypothetical-enactment');
    expect(transition.labels).toContain('HYPOTHETICAL ENACTMENT — not enacted law');
    expect(resolveTemporalApplicability(fixture,proposal,{...common,asOf:'2026-08-02'}).effectiveChanges).toEqual(['routing']);
  });
  it('selects an enacted pinned law only after enactment date and defined effective dates',()=>{
    const enacted:ProposedFramework={...proposal,status:'enacted',enactedOn:'2026-06-01'};
    expect(resolveTemporalApplicability(fixture,enacted,{jurisdiction,asOf:'2026-05-01',compareProposal:true}).kind).toBe('proposed-not-enacted');
    const result=resolveTemporalApplicability(fixture,enacted,{asOf,jurisdiction,compareProposal:true});
    expect(result.kind).toBe('enacted');
    expect(result.effectiveChanges).toEqual(['routing']);
  });
  it('never fills baseline source gaps with guessed duties or statutes',()=>{
    const missing=firstComparisonBaselineInventory();
    const result=resolveTemporalApplicability(missing,proposal,{asOf:'2026-10-17',jurisdiction,compareProposal:true,assumeEnactment:true});
    expect(result.resolvable).toBe(false);
    expect(result.baselineSources).toEqual(['gpo-uscode-2024-44usc3506','gpo-uscode-2024-5usc552']);
    expect(result.gaps.map(g=>g.id)).toContain('official-baseline');
  });
  it('pins exact 2024 GPO excerpt bytes while preserving incomplete 2026 coverage',async()=>{
    const b=firstComparisonBaselineInventory();
    const paths=['USCODE-2024-title44-3506-excerpt.txt','USCODE-2024-title5-552-excerpt.txt'];
    expect(b.sources.length).toBe(paths.length);
    for(let i=0;i<paths.length;i++){
      const content=readFileSync(new URL('../../../content/baselines/electronic-filing/'+paths[i],import.meta.url));
      expect(await sha256Hex(content)).toBe(b.sources[i]!.digest);
      expect(new TextDecoder().decode(content)).toBe(b.sources[i]!.excerptText);
      expect(b.sources[i]!.digestScope).toBe('curated-excerpt');
    }
    expect(b.gaps.map(x=>x.id)).toContain('official-baseline');
  });
  it('rejects mismatched jurisdiction/agency rather than assuming universal applicability',()=>{
    const result=resolveTemporalApplicability(fixture,proposal,{asOf,jurisdiction:'state-NY',compareProposal:true});
    expect(result.kind).toBe('scope-mismatch');
    expect(result.effectiveChanges).toEqual([]);
    const agency:BaselineSnapshot={...fixture,agency:'Agency A'};
    expect(resolveTemporalApplicability(agency,proposal,{asOf,jurisdiction,agency:'Agency B',compareProposal:true}).kind).toBe('scope-mismatch');
  });
  it('rejects invalid temporal input, inaccessible official baseline URLs, and unsigned sources',()=>{
    expect(()=>resolveTemporalApplicability(fixture,proposal,{asOf:'2026-02-30',jurisdiction})).toThrow('TEMPORAL_INVALID_DATE');
    expect(()=>resolveTemporalApplicability(fixture,proposal,{asOf:'2025-01-01',jurisdiction})).toThrow('BASELINE_FROM_FUTURE');
    expect(()=>resolveTemporalApplicability({...fixture,sources:fixture.sources.map(s=>({...s,sourceUrl:'file:///tmp/x'}))},null,{asOf,jurisdiction})).toThrow('BASELINE_INVALID_SOURCE');
    expect(()=>resolveTemporalApplicability({...fixture,sources:fixture.sources.map(s=>({...s,verified:false}))},null,{asOf,jurisdiction})).toThrow('BASELINE_INVALID_SOURCE');
  });
  it('rejects impossible transition intervals and duplicate legal changes',()=>{
    const broken={...proposal,changes:proposal.changes.map(x=>({...x,transitionEndsOn:'2026-06-01'}))};
    expect(()=>resolveTemporalApplicability(fixture,broken,{asOf,jurisdiction,compareProposal:true,assumeEnactment:true})).toThrow('TEMPORAL_INVALID_TRANSITION');
    const duplicate={...proposal,changes:[...proposal.changes,...proposal.changes]};
    expect(()=>resolveTemporalApplicability(fixture,duplicate,{asOf,jurisdiction,compareProposal:true,assumeEnactment:true})).toThrow('TEMPORAL_INVALID_CHANGE');
  });
});
