import { readFileSync } from 'node:fs';
import { describe,it,expect } from 'vitest';
import { assessCoverage, type CapabilityList, type CoveragePack } from '../../packages/legislation/src/index.ts';
import type { ModelBundle } from '../../packages/contracts/src/model.ts';

const fixture = new URL('../../packages/contracts/fixtures/v1-hypothetical.json', import.meta.url);
const bundle = (): ModelBundle => JSON.parse(readFileSync(fixture,'utf8')) as ModelBundle;
const pack = (): CoveragePack => ({
  versionId:'v1',baselineDate:'2026-01-01',hypothetical:true,
  mappings:[{provisionId:'p1',mode:'modeled'}],
  requires:{operations:['toy-opaque-operation'],calendars:[],domains:[]}
});
const supported = (): CapabilityList => ({operations:['toy-opaque-operation'],calendars:[],domains:[]});

describe('LM-007 explicit coverage and capabilities',()=>{
  it('counts only pinned explicit mappings and retains every required disclosure',()=>{
    const report=assessCoverage(bundle(),pack(),supported());
    expect(report.counts).toEqual({modeled:1,'explanatory-only':0,ambiguous:0,unsupported:0,unmapped:0});
    expect(report.completeWithinDeclaredScope).toBe(true);
    expect(report.disclosures.legalStatus).toMatch(/Draft proposal.+not enacted/);
    expect(report.disclosures.baseline).toBe('Baseline model dated 2026-01-01');
    expect(report.disclosures.scenario).toMatch(/Hypothetical/);
  });
  it('never reports complete when an operation is unsupported',()=>{
    const report=assessCoverage(bundle(),pack(),{...supported(),operations:[]});
    expect(report.completeWithinDeclaredScope).toBe(false);
    expect(report.canRunPartialModel).toBe(false);
    expect(report.missingCapabilities.operations).toEqual(['toy-opaque-operation']);
    expect(report.diagnostics.map(e=>e.code)).toContain('UNSUPPORTED_CAPABILITY');
  });
  it('declares missing provision mappings instead of inventing coverage',()=>{
    const report=assessCoverage(bundle(),{...pack(),mappings:[]},supported());
    expect(report.counts.unmapped).toBe(1);
    expect(report.counts.modeled).toBe(0);
    expect(report.completeWithinDeclaredScope).toBe(false);
    expect(report.diagnostics.map(e=>e.code)).toContain('UNMAPPED_PROVISIONS');
  });
  it('rejects duplicate IDs, unknown provisions and invalid coverage modes',()=>{
    const p=pack();
    const repeated=assessCoverage(bundle(),{...p,mappings:[...p.mappings,...p.mappings]},supported());
    expect(repeated.diagnostics.map(e=>e.code)).toContain('DUPLICATE_MAPPING');
    const unknown=assessCoverage(bundle(),{...p,mappings:[{provisionId:'missing',mode:'modeled'}]},supported());
    expect(unknown.diagnostics.map(e=>e.code)).toContain('UNKNOWN_PROVISION');
    const invalid=assessCoverage(bundle(),{...p,mappings:[{provisionId:'p1',mode:'unreviewed' as 'modeled'}]},supported());
    expect(invalid.diagnostics.map(e=>e.code)).toContain('INVALID_MAPPING');
  });
  it('keeps draft/status disclosures independent of visual scene selection',()=>{
    const report=assessCoverage(bundle(),pack(),supported());
    const sourceScene={scene:'source',labels:report.disclosures};
    const mapScene={scene:'map',labels:report.disclosures};
    expect(sourceScene.labels.legalStatus).toEqual(mapScene.labels.legalStatus);
    expect(mapScene.labels.legalStatus).toContain('not enacted');
    expect(mapScene.labels.scenario).toContain('Hypothetical');
  });
  it('rejects unknown operations even when host would implement an undeclared operation',()=>{
    const report=assessCoverage(bundle(),{...pack(),requires:{...pack().requires,operations:[]}},supported());
    expect(report.diagnostics.map(e=>e.code)).toContain('UNDECLARED_RULE_OPERATION');
    expect(report.completeWithinDeclaredScope).toBe(false);
  });
  it('requires reasons for ambiguous and unsupported claims',()=>{
    const report=assessCoverage(bundle(),{...pack(),mappings:[{provisionId:'p1',mode:'ambiguous'}]},supported());
    expect(report.diagnostics.map(e=>e.code)).toContain('MISSING_REASON');
    expect(report.completeWithinDeclaredScope).toBe(false);
    const explained=assessCoverage(bundle(),{...pack(),mappings:[{provisionId:'p1',mode:'unsupported',reason:'Toy feature unavailable'}]},supported());
    expect(explained.counts.unsupported).toBe(1);
    expect(explained.disclosures.coverage).toContain('Partial coverage');
  });
  it('rejects false baselines and non-hypothetical scenarios',()=>{
    const baseline=assessCoverage(bundle(),{...pack(),baselineDate:'2026-02-30'},supported());
    expect(baseline.diagnostics.map(e=>e.code)).toContain('INVALID_BASELINE_DATE');
    const unmarked=assessCoverage(bundle(),{...pack(),hypothetical:false as true},supported());
    expect(unmarked.diagnostics.map(e=>e.code)).toContain('INVALID_PACK');
  });
});
