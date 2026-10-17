import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {inspectFirstPack} from '../../packages/legislation/src/pack-readiness.ts';
const source=readFileSync(new URL('../../content/packs/electronic-filing/scenario-inventory.json',import.meta.url),'utf8');
const inventory=()=>JSON.parse(source) as {status:string;sourceStatus:string;baselineStatus:string;scenarios:Array<{id:string;hypothetical:boolean;sourceRefs:string[];unresolved:string[]}>};
describe('LM-018 electronic-filing first pack source gates',()=>{
 it('retains all 14 scenario names without inventing legal sources or executable outcomes',()=>{
  const report=inspectFirstPack(inventory());
  expect(report.coverage).toEqual({total:14,sourceAnchored:0,modelReady:0});
  expect(report.readyForPublication).toBe(false);
  expect(report.readyForExecution).toBe(false);
  expect(report.diagnostics).toContain('PINNED_SOURCES_NOT_VERIFIED');
  expect(report.diagnostics).toContain('SCENARIOS_NOT_SOURCE_READY');
 });
 it('requires all unique IDs from approved specification',()=>{
  const missing=inventory();missing.scenarios.pop();
  expect(inspectFirstPack(missing).diagnostics).toContain('PACK_INVALID');
  const duplicate=inventory();duplicate.scenarios[1]!.id=duplicate.scenarios[0]!.id;
  expect(inspectFirstPack(duplicate).diagnostics).toContain('SCENARIO_INVALID:1');
  expect(inspectFirstPack(duplicate).diagnostics).toContain('SCENARIO_SET_INCOMPLETE');
 });
 it('blocks manipulated proposal labels from falsely enabling publication',()=>{
  const a=inventory();
  a.status='candidate';a.sourceStatus='verified';a.baselineStatus='verified';
  expect(inspectFirstPack(a).readyForPublication).toBe(false);
  expect(inspectFirstPack(a).diagnostics).toContain('SCENARIOS_NOT_SOURCE_READY');
  a.scenarios[0]!.hypothetical=false;
  expect(inspectFirstPack(a).diagnostics).toContain('SCENARIO_INVALID:0');
 });
 it('denies forged all-verified metadata and rejects malformed array entries without throwing',()=>{
  const f=inventory() as ReturnType<typeof inventory> & {sourceInventory?:unknown[]};
  f.status='candidate';f.sourceStatus='verified';f.baselineStatus='verified';
  f.scenarios.forEach(s=>{const item=s as typeof s & {classification:string;verifiedLaw:boolean;baselineSnapshot:string|null};item.classification='verified-model';item.verifiedLaw=true;item.sourceRefs=['fabricated'];item.baselineSnapshot='invented';});
  f.sourceInventory=[{id:'fabricated',availability:'verified',digest:'a'.repeat(64),retrievedAt:'2026-10-17'}, {id:'also-fabricated',availability:'verified',digest:'b'.repeat(64),retrievedAt:'2026-10-17'}];
  const verdict=inspectFirstPack(f);
  expect(verdict.readyForPublication).toBe(false);
  expect(verdict.diagnostics).toContain('TRUSTED_SOURCE_VERIFICATION_REQUIRED');
  const bad=inventory();(bad.scenarios as unknown[])[0]=null;
  expect(()=>inspectFirstPack(bad)).not.toThrow();
  expect(inspectFirstPack(bad).readyForExecution).toBe(false);
 });
 it('keeps source disclosures visible for wrong agency, missing amount, outage and protected material',()=>{
  const pack=inventory();
  for(const id of ['complete-wrong-agency','missing-amount','outage','protected-material']){
   const s=pack.scenarios.find((x:{id:string})=>x.id===id);
   expect(s?.hypothetical).toBe(true);
   expect(s?.sourceRefs).toEqual([]);
   expect(s?.unresolved.length).toBeGreaterThan(0);
  }
 });
});
