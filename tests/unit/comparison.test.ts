import { describe, expect, it } from 'vitest';
import {
  compareFrameworks, type ComparisonExecutor, type ComparisonFramework,
  type ComparisonScenario
} from '../../packages/simulation/src/comparison.ts';

const baseline: ComparisonFramework = {
  id: 'baseline', versionId: 'law-v1', status: 'enacted', modelDigest: 'a'.repeat(64),
  engineVersion: '1.0.0', calendarVersion: 'fictional-calendar-1',
  baselineAsOf: '2026-01-01', jurisdiction: 'toy', agency: 'desk'
};
const proposal: ComparisonFramework = {
  ...baseline, id: 'proposal', versionId: 'law-v2', status: 'draft', modelDigest: 'b'.repeat(64)
};
const scenario: ComparisonScenario = {
  id: 'fictional-routing', asOf: '2026-01-01', jurisdiction: 'toy', agency: 'desk',
  seed: 42, hypothetical: true, assumeProposalEnactment: true,
  facts: { filingReceived: true }, implementation: { staff: 1, queueRate: 5, compliance: true }
};
const point = (semanticKey: string, dueTick: number) => ({
  semanticKey, eventId: 'event-' + semanticKey, legalForce: 'obligation' as const,
  dutyState: 'pending' as const, eventTick: 0, dueTick, workloadUnits: 1,
  sourceRefs: ['toy-source:1'], unresolved: [] as string[]
});
describe('LM-027 pinned before/after framework comparisons', () => {
  it('preserves shared inputs and stable semantic alignment despite disappeared steps', async () => {
    const inputs: string[] = [];
    const random: number[] = [];
    const run: ComparisonExecutor = async context => {
      inputs.push(JSON.stringify(context.scenario));
      const routing = await context.stream('routing');
      random.push(routing.nextUint32());
      if (context.framework.id === 'baseline') {
        const extra = await context.stream('irrelevant');
        extra.nextUint32(); extra.nextUint32();
      }
      return {
        checkpoints: context.framework.id === 'baseline'
          ? [point('intake', 4), point('old-route', 5)]
          : [point('new-route', 2), point('intake', 2)],
        warnings: []
      };
    };
    const result = await compareFrameworks(baseline, proposal, scenario, run);
    expect(inputs).toHaveLength(2);
    expect(inputs[0]).toEqual(inputs[1]);
    expect(random[0]).toBe(random[1]);
    expect(result.baselineRunId).not.toBe(result.proposalRunId);
    expect(result.hypotheticalEnactment).toBe(true);
    expect(result.warnings).toContain('HYPOTHETICAL_ENACTMENT_NOT_CURRENT_LAW');
    expect(result.changes.map(c => [c.semanticKey, c.kind])).toEqual([
      ['intake', 'modified'], ['new-route', 'added'], ['old-route', 'removed']
    ]);
    expect(result.changes[0]?.reasons).toContain('TIMING_CHANGED');
  });
  it('rejects speculative enactment and mismatched date, engine or jurisdiction', async () => {
    const run: ComparisonExecutor = () => ({checkpoints: [], warnings: []});
    await expect(compareFrameworks(baseline,proposal,{...scenario, assumeProposalEnactment:false},run))
      .rejects.toThrow('COMPARISON_ENACTMENT_ASSUMPTION_REQUIRED');
    await expect(compareFrameworks(baseline,{...proposal, baselineAsOf:'2025-01-01'},scenario,run))
      .rejects.toThrow('COMPARISON_INCOMPATIBLE_SCOPE');
    await expect(compareFrameworks(baseline,{...proposal, engineVersion:'2.0.0'},scenario,run))
      .rejects.toThrow('COMPARISON_INCOMPATIBLE_SCOPE');
    await expect(compareFrameworks(baseline,{...proposal, jurisdiction:'other'},scenario,run))
      .rejects.toThrow('COMPARISON_INCOMPATIBLE_SCOPE');
  });
  it('does not allow silent input mutations or duplicate semantic checkpoints', async () => {
    const mutate: ComparisonExecutor = context => {
      (context.scenario.facts as Record<string,unknown>).filingReceived = false;
      return {checkpoints:[], warnings:[]};
    };
    await expect(compareFrameworks(baseline,proposal,scenario,mutate)).rejects.toThrow();
    const duplicate: ComparisonExecutor = () => ({checkpoints:[point('intake',1),point('intake',2)],warnings:[]});
    await expect(compareFrameworks(baseline,proposal,scenario,duplicate))
      .rejects.toThrow('COMPARISON_CHECKPOINT_DUPLICATE');
  });
  it('keeps uncertainty unresolved instead of replacing it with an inferred outcome', async () => {
    const run: ComparisonExecutor = context => ({
      checkpoints: [{
        ...point('intake', 3),
        legalForce: context.framework.id === 'baseline' ? 'unknown' : 'obligation',
        dutyState: 'unknown',
        unresolved: ['UNSUPPORTED_INTERPRETATION']
      }],
      warnings: []
    });
    const result = await compareFrameworks(baseline,proposal,scenario,run);
    expect(result.state).toBe('unresolved');
    expect(result.changes[0]?.reasons).toContain('LEGAL_FORCE_CHANGED');
  });
  it('rejects unsupported status, malformed output and unsupported numeric data', async () => {
    const good: ComparisonExecutor = () => ({checkpoints:[],warnings:[]});
    await expect(compareFrameworks({...baseline,status:'draft'},proposal,scenario,good))
      .rejects.toThrow('COMPARISON_LEGAL_STATUS_INVALID');
    const bad: ComparisonExecutor = () => ({checkpoints:[{...point('x',1),workloadUnits:Infinity}],warnings:[]});
    await expect(compareFrameworks(baseline,proposal,scenario,bad))
      .rejects.toThrow('COMPARISON_CHECKPOINT_INVALID');
    await expect(compareFrameworks(baseline,proposal,{...scenario, facts: () => 1},good))
      .rejects.toThrow();
  });
});
