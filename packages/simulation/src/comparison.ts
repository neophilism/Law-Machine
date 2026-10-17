import { canonicalDigest, canonicalJSON } from '../../contracts/src/integrity.ts';
import { namedStream, runIdentity, type ReplayDescriptor, type ReplayStream } from './replay.ts';

/** LM-027: model comparisons are hypothetical interpretations, never legal advice. */
export type ComparisonFramework = {
  readonly id: string;
  readonly versionId: string;
  readonly status: 'draft' | 'introduced' | 'enacted' | 'repealed';
  readonly modelDigest: string;
  readonly engineVersion: string;
  readonly calendarVersion: string;
  readonly baselineAsOf: string;
  readonly jurisdiction: string;
  readonly agency: string;
};
export type ComparisonScenario = {
  readonly id: string;
  readonly asOf: string;
  readonly jurisdiction: string;
  readonly agency: string;
  readonly seed: number;
  readonly hypothetical: true;
  readonly assumeProposalEnactment: boolean;
  readonly facts: unknown;
  readonly implementation: unknown;
};
export type ComparisonCheckpoint = {
  /** Authored stable semantic identity, not position or automatically guessed similarity. */
  readonly semanticKey: string;
  readonly eventId: string;
  readonly legalForce: 'none' | 'obligation' | 'right' | 'permission' | 'prohibition' | 'unknown';
  readonly dutyState: 'none' | 'pending' | 'satisfied' | 'breached' | 'unknown';
  readonly eventTick: number | null;
  readonly dueTick: number | null;
  readonly workloadUnits: number | null;
  readonly sourceRefs: readonly string[];
  readonly unresolved: readonly string[];
};
export type ComparisonRun = {
  readonly checkpoints: readonly ComparisonCheckpoint[];
  readonly warnings: readonly string[];
};
export type ComparisonContext = {
  readonly framework: Readonly<ComparisonFramework>;
  readonly scenario: Readonly<ComparisonScenario>;
  readonly runId: string;
  readonly stream: (name: string) => Promise<ReplayStream>;
};
export type ComparisonExecutor = (context: ComparisonContext) => ComparisonRun | Promise<ComparisonRun>;
export type ComparisonChange = {
  readonly semanticKey: string;
  readonly kind: 'unchanged' | 'modified' | 'added' | 'removed';
  readonly baseline: ComparisonCheckpoint | null;
  readonly proposal: ComparisonCheckpoint | null;
  readonly reasons: readonly string[];
};
export type FrameworkComparison = {
  readonly state: 'resolved' | 'unresolved';
  readonly hypotheticalEnactment: boolean;
  readonly sharedInputDigest: string;
  readonly baselineRunId: string;
  readonly proposalRunId: string;
  readonly baselineStatus: 'enacted';
  readonly proposalStatus: ComparisonFramework['status'];
  readonly changes: readonly ComparisonChange[];
  readonly warnings: readonly string[];
};

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SHA = /^[a-f0-9]{64}$/;
function dateIsValid(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value + 'T00:00:00Z')) &&
    new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
}
const id = (v: unknown): v is string => typeof v === 'string' && ID.test(v);
const validTick = (v: unknown) => v === null || (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0);
const strings = (v: unknown, max: number): v is string[] =>
  Array.isArray(v) && v.length <= max && v.every(id);
function validateFramework(value: ComparisonFramework): void {
  if (!value || !id(value.id) || !id(value.versionId) || !SHA.test(value.modelDigest) ||
      !id(value.engineVersion) || !id(value.calendarVersion) || !dateIsValid(value.baselineAsOf) ||
      !id(value.jurisdiction) || !id(value.agency) ||
      !['draft', 'introduced', 'enacted', 'repealed'].includes(value.status))
    throw Error('COMPARISON_FRAMEWORK_INVALID');
}
function freezeDeep(value: unknown): void {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return;
  for (const child of Object.values(value)) freezeDeep(child);
  Object.freeze(value);
}
function snapshot<T>(value: T): T {
  const copy = JSON.parse(canonicalJSON(value)) as T;
  freezeDeep(copy);
  return copy;
}
function checkRun(run: ComparisonRun): Map<string, ComparisonCheckpoint> {
  if (!run || !Array.isArray(run.checkpoints) || run.checkpoints.length > 2048 ||
      !strings(run.warnings, 100)) throw Error('COMPARISON_RUN_INVALID');
  const result = new Map<string, ComparisonCheckpoint>();
  for (const point of run.checkpoints) {
    if (!point || !id(point.semanticKey) || !id(point.eventId) ||
        !['none', 'obligation', 'right', 'permission', 'prohibition', 'unknown'].includes(point.legalForce) ||
        !['none', 'pending', 'satisfied', 'breached', 'unknown'].includes(point.dutyState) ||
        !validTick(point.eventTick) || !validTick(point.dueTick) ||
        !validTick(point.workloadUnits) ||
        !strings(point.sourceRefs, 100) || !strings(point.unresolved, 100) ||
        ((point.legalForce !== 'none' && point.legalForce !== 'unknown') && !point.sourceRefs.length))
      throw Error('COMPARISON_CHECKPOINT_INVALID');
    if (result.has(point.semanticKey)) throw Error('COMPARISON_CHECKPOINT_DUPLICATE');
    result.set(point.semanticKey, snapshot(point));
  }
  return result;
}
function comparePoint(key: string, a: ComparisonCheckpoint | null, b: ComparisonCheckpoint | null): ComparisonChange {
  if (!a) return { semanticKey: key, kind: 'added', baseline: null, proposal: b, reasons: ['PROPOSAL_ADDS_STEP'] };
  if (!b) return { semanticKey: key, kind: 'removed', baseline: a, proposal: null, reasons: ['PROPOSAL_REMOVES_STEP'] };
  const reasons: string[] = [];
  if (a.legalForce !== b.legalForce) reasons.push('LEGAL_FORCE_CHANGED');
  if (a.dutyState !== b.dutyState) reasons.push('DUTY_STATE_CHANGED');
  if (a.eventTick !== b.eventTick || a.dueTick !== b.dueTick) reasons.push('TIMING_CHANGED');
  if (a.workloadUnits !== b.workloadUnits) reasons.push('OPERATIONAL_LOAD_CHANGED');
  if (canonicalJSON(a.unresolved) !== canonicalJSON(b.unresolved)) reasons.push('UNCERTAINTY_CHANGED');
  if (canonicalJSON(a.sourceRefs) !== canonicalJSON(b.sourceRefs)) reasons.push('PROVENANCE_CHANGED');
  return { semanticKey: key, kind: reasons.length ? 'modified' : 'unchanged', baseline: a, proposal: b, reasons };
}
/**
 * Both frameworks receive detached, identical, frozen scenario inputs.
 * Separate named stream caches derive from one shared common-random-numbers
 * descriptor (not either framework's model digest). Additional events or
 * named streams on one side do not shift a different named stream.
 * The authored executor must return source-linked semantic checkpoints.
 */
export async function compareFrameworks(
  baseline: ComparisonFramework, proposal: ComparisonFramework,
  scenario: ComparisonScenario, executor: ComparisonExecutor
): Promise<FrameworkComparison> {
  validateFramework(baseline);
  validateFramework(proposal);
  if (baseline.status !== 'enacted' || proposal.status === 'repealed') throw Error('COMPARISON_LEGAL_STATUS_INVALID');
  if (!scenario || !id(scenario.id) || !dateIsValid(scenario.asOf) ||
      !id(scenario.jurisdiction) || !id(scenario.agency) || scenario.hypothetical !== true ||
      typeof scenario.assumeProposalEnactment !== 'boolean' ||
      !Number.isSafeInteger(scenario.seed) || scenario.seed < 0 || scenario.seed > 0xffffffff ||
      typeof executor !== 'function') throw Error('COMPARISON_SCENARIO_INVALID');
  if (baseline.baselineAsOf !== scenario.asOf || proposal.baselineAsOf !== scenario.asOf ||
      baseline.jurisdiction !== scenario.jurisdiction || proposal.jurisdiction !== scenario.jurisdiction ||
      baseline.agency !== scenario.agency || proposal.agency !== scenario.agency ||
      baseline.engineVersion !== proposal.engineVersion ||
      baseline.calendarVersion !== proposal.calendarVersion)
    throw Error('COMPARISON_INCOMPATIBLE_SCOPE');
  const hypotheticalEnactment = proposal.status !== 'enacted';
  if (hypotheticalEnactment && !scenario.assumeProposalEnactment)
    throw Error('COMPARISON_ENACTMENT_ASSUMPTION_REQUIRED');
  const facts = canonicalJSON({facts: scenario.facts, implementation: scenario.implementation});
  if (facts.length > 200000) throw Error('COMPARISON_INPUT_LIMIT');
  const sharedInputDigest = await canonicalDigest({
    scenario: scenario.id, asOf: scenario.asOf, jurisdiction: scenario.jurisdiction,
    agency: scenario.agency, seed: scenario.seed, facts: scenario.facts, implementation: scenario.implementation
  });
  const sharedDescriptor: ReplayDescriptor = {
    engineVersion: baseline.engineVersion,
    calendarVersion: baseline.calendarVersion,
    modelDigest: sharedInputDigest, scenarioId: scenario.id,
    seed: scenario.seed,
    facts: { facts: scenario.facts, implementation: scenario.implementation }
  };
  const replayFacts = {
    asOf: scenario.asOf, jurisdiction: scenario.jurisdiction, agency: scenario.agency,
    facts: scenario.facts, implementation: scenario.implementation
  };
  function context(framework: ComparisonFramework): Promise<ComparisonContext> {
    const descriptor: ReplayDescriptor = {
      ...sharedDescriptor, modelDigest: framework.modelDigest, facts: replayFacts
    };
    return runIdentity(descriptor).then(runId => {
      const streams = new Map<string, Promise<ReplayStream>>();
      return {
        framework: snapshot(framework),
        scenario: snapshot(scenario),
        runId,
        stream(name: string) {
          const existing = streams.get(name);
          if (existing) return existing;
          // namedStream validates namespace and rejects malformed stream IDs.
          const next = namedStream(sharedDescriptor, name);
          streams.set(name, next);
          return next;
        }
      };
    });
  }
  const [leftContext, rightContext] = await Promise.all([context(baseline), context(proposal)]);
  // Runs are intentionally sequential to avoid nondeterministic external side effects.
  const left = await executor(leftContext);
  const right = await executor(rightContext);
  const a = checkRun(left);
  const b = checkRun(right);
  const keys = [...new Set([...a.keys(), ...b.keys()])].sort();
  const changes = keys.map(key => comparePoint(key, a.get(key) ?? null, b.get(key) ?? null));
  const warnings = [...new Set([
    ...(hypotheticalEnactment ? ['HYPOTHETICAL_ENACTMENT_NOT_CURRENT_LAW'] : []),
    ...left.warnings, ...right.warnings
  ])].sort();
  const unresolved = changes.some(c =>
    c.baseline?.legalForce === 'unknown' || c.proposal?.legalForce === 'unknown' ||
    c.baseline?.dutyState === 'unknown' || c.proposal?.dutyState === 'unknown' ||
    !!c.baseline?.unresolved.length || !!c.proposal?.unresolved.length
  );
  return {
    state: unresolved ? 'unresolved' : 'resolved',
    hypotheticalEnactment,
    sharedInputDigest, baselineRunId: leftContext.runId,
    proposalRunId: rightContext.runId, baselineStatus: 'enacted',
    proposalStatus: proposal.status, changes, warnings
  };
}
