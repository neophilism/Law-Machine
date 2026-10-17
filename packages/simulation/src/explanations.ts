import type { SourceRef } from '../../contracts/src/model.ts';

/**
 * LM-028: source-linked explanation projection. These authored structured records
 * describe externally validated simulation traces; no text model runs here.
 * A render cannot introduce transitions or resolve an unknown condition.
 */
export type EvidenceRecord = {
  readonly id: string;
  readonly classification: 'source' | 'interpretation' | 'empirical' | 'assumption' | 'unknown';
  readonly description: string;
  readonly sourceRefs: readonly SourceRef[];
};
export type ExplanationSource = {
  readonly versionId: string;
  readonly provisionId: string;
  readonly sourceDigest: string;
  readonly citation: string;
  readonly text: string;
};
export type AuthoredToken =
  | { readonly kind: 'literal'; readonly value: string }
  | { readonly kind: 'field'; readonly value: 'actorId' | 'eventId' | 'ruleId' | 'outcome' };
export type ExplanationRule = {
  readonly id: string;
  readonly versionId: string;
  readonly sourceRefs: readonly SourceRef[];
  readonly tokens: readonly AuthoredToken[];
};
export type PredicateObservation = {
  readonly factId: string;
  readonly result: true | false | 'unknown';
  readonly evidenceId: string | null;
};
export type ExplanationEvent = {
  readonly id: string;
  readonly tick: number;
  readonly parentIds: readonly string[];
  readonly alternativeIds: readonly string[];
  readonly actorId: string;
  readonly ruleId: string;
  readonly versionId: string;
  readonly outcome: 'pending' | 'satisfied' | 'breached' | 'not-applicable' | 'unknown';
  readonly predicates: readonly PredicateObservation[];
  readonly appliedExceptions: readonly string[];
  readonly evidenceIds: readonly string[];
  readonly sourceRefs: readonly SourceRef[];
};
export type ExplanationView = {
  readonly eventId: string;
  readonly state: 'supported' | 'unresolved';
  readonly outcome: ExplanationEvent['outcome'];
  readonly ruleId: string;
  readonly causalEventIds: readonly string[];
  readonly alternativeEventIds: readonly string[];
  readonly predicates: readonly PredicateObservation[];
  readonly appliedExceptions: readonly string[];
  readonly evidence: readonly EvidenceRecord[];
  readonly sourceExcerpts: readonly { citation: string; exactQuote: string; versionId: string; sourceDigest: string }[];
  readonly publicText: string;
  readonly warnings: readonly string[];
};
export type ExplanationGraph = {
  readonly views: readonly ExplanationView[];
  readonly totalEvents: number;
  readonly unresolvedEvents: number;
};
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SHA = /^[a-f0-9]{64}$/;
const id = (v: unknown): v is string => typeof v === 'string' && ID.test(v);
const list = (v: unknown, max: number): v is string[] => Array.isArray(v) && v.length <= max && v.every(id);
const refValid = (v: SourceRef) => !!v && id(v.versionId) && id(v.provisionId) &&
  typeof v.sourceDigest === 'string' && SHA.test(v.sourceDigest) &&
  typeof v.quote === 'string' && v.quote.length > 0 && v.quote.length <= 8192;
const key = (r: SourceRef) => JSON.stringify([r.versionId, r.provisionId, r.sourceDigest, r.quote]);
const sourceKey = (r: Pick<SourceRef, 'versionId' | 'provisionId'>) =>
  JSON.stringify([r.versionId, r.provisionId]);
const finiteTick = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;

function authoredText(rule: ExplanationRule, event: ExplanationEvent, unresolved: boolean): string {
  // Unknown facts or outcomes never use a potentially overconfident public template.
  if (unresolved) return 'Hypothetical outcome unresolved; the cited record does not establish a definitive result.';
  const fields = {actorId: event.actorId, eventId: event.id, ruleId: event.ruleId, outcome: event.outcome};
  return 'Hypothetical modeled result: ' + rule.tokens.map(token =>
    token.kind === 'literal' ? token.value : fields[token.value]).join('');
}

export function buildExplanationGraph(
  events: readonly ExplanationEvent[],
  rules: readonly ExplanationRule[],
  sources: readonly ExplanationSource[],
  evidence: readonly EvidenceRecord[]
): ExplanationGraph {
  if (!Array.isArray(events) || !Array.isArray(rules) || !Array.isArray(sources) ||
      !Array.isArray(evidence) || events.length > 2048 || rules.length > 10000 ||
      sources.length > 10000 || evidence.length > 10000)
    throw Error('EXPLANATION_BUDGET');
  const byEvent = new Map<string, ExplanationEvent>();
  const positions = new Map<string, number>();
  const byRule = new Map<string, ExplanationRule>();
  const bySource = new Map<string, ExplanationSource>();
  const byEvidence = new Map<string, EvidenceRecord>();
  for (const s of sources) {
    if (!s || !id(s.versionId) || !id(s.provisionId) ||
        !SHA.test(s.sourceDigest) || typeof s.citation !== 'string' ||
        !s.citation || s.citation.length > 400 || typeof s.text !== 'string' ||
        s.text.length > 100000 || bySource.has(sourceKey(s)))
      throw Error('EXPLANATION_SOURCE_INVALID');
    bySource.set(sourceKey(s), s);
  }
  const resolve = (ref: SourceRef) => {
    if (!refValid(ref)) throw Error('EXPLANATION_ANCHOR_INVALID');
    const source = bySource.get(sourceKey(ref));
    if (!source || source.sourceDigest !== ref.sourceDigest || !source.text.includes(ref.quote))
      throw Error('EXPLANATION_ANCHOR_STALE');
    return source;
  };
  for (const r of rules) {
    if (!r || !id(r.id) || !id(r.versionId) || !Array.isArray(r.sourceRefs) ||
        !r.sourceRefs.length || r.sourceRefs.length > 100 || !Array.isArray(r.tokens) ||
        !r.tokens.length || r.tokens.length > 100 || byRule.has(r.id))
      throw Error('EXPLANATION_RULE_INVALID');
    for (const ref of r.sourceRefs) {
      if (ref.versionId !== r.versionId) throw Error('EXPLANATION_RULE_VERSION');
      resolve(ref);
    }
    for (const token of r.tokens) {
      if (!token || !['literal', 'field'].includes(token.kind) ||
          typeof token.value !== 'string' || token.value.length > 1000 ||
          (token.kind === 'field' && !['actorId', 'eventId', 'ruleId', 'outcome'].includes(token.value)))
        throw Error('EXPLANATION_TEMPLATE_INVALID');
    }
    byRule.set(r.id, r);
  }
  for (const e of evidence) {
    if (!e || !id(e.id) || byEvidence.has(e.id) ||
        !['source','interpretation','empirical','assumption','unknown'].includes(e.classification) ||
        typeof e.description !== 'string' || !e.description || e.description.length > 2000 ||
        !Array.isArray(e.sourceRefs) || e.sourceRefs.length > 100)
      throw Error('EXPLANATION_EVIDENCE_INVALID');
    for (const ref of e.sourceRefs) resolve(ref);
    byEvidence.set(e.id, e);
  }
  for (const [i, event] of events.entries()) {
    if (!event || !id(event.id) || byEvent.has(event.id) || !finiteTick(event.tick) ||
        !id(event.actorId) || !id(event.ruleId) || !id(event.versionId) ||
        !['pending','satisfied','breached','not-applicable','unknown'].includes(event.outcome) ||
        !list(event.parentIds, 32) || !list(event.alternativeIds, 32) ||
        !list(event.appliedExceptions, 100) || !list(event.evidenceIds, 100) ||
        !Array.isArray(event.predicates) || event.predicates.length > 100 ||
        !Array.isArray(event.sourceRefs) || !event.sourceRefs.length || event.sourceRefs.length > 100)
      throw Error('EXPLANATION_EVENT_INVALID');
    const rule = byRule.get(event.ruleId);
    if (!rule || rule.versionId !== event.versionId) throw Error('EXPLANATION_RULE_UNRESOLVED');
    const allowed = new Set(rule.sourceRefs.map(key));
    for (const ref of event.sourceRefs) {
      if (ref.versionId !== event.versionId || !allowed.has(key(ref)))
        throw Error('EXPLANATION_SOURCE_NOT_RULE_SUPPORTED');
      resolve(ref);
    }
    for (const ref of event.evidenceIds) if (!byEvidence.has(ref)) throw Error('EXPLANATION_EVIDENCE_MISSING');
    for (const p of event.predicates) {
      if (!p || !id(p.factId) || ![true,false,'unknown'].includes(p.result) ||
          !(p.evidenceId === null || id(p.evidenceId)))
        throw Error('EXPLANATION_PREDICATE_INVALID');
      if (p.evidenceId !== null && !byEvidence.has(p.evidenceId))
        throw Error('EXPLANATION_EVIDENCE_MISSING');
    }
    byEvent.set(event.id, event);
    positions.set(event.id, i);
  }
  for (const event of events) {
    if (new Set(event.parentIds).size !== event.parentIds.length ||
        new Set(event.alternativeIds).size !== event.alternativeIds.length ||
        event.parentIds.includes(event.id) || event.alternativeIds.includes(event.id))
      throw Error('EXPLANATION_RELATION_INVALID');
    for (const parent of event.parentIds) {
      const p = byEvent.get(parent);
      if (!p || p.tick > event.tick) throw Error('EXPLANATION_CAUSAL_PARENT_INVALID');
    }
    for (const alt of event.alternativeIds)
      if (!byEvent.has(alt)) throw Error('EXPLANATION_ALTERNATIVE_INVALID');
  }
  // Bounded iterative DFS avoids recursion limits and rejects causal cycles.
  const visited = new Set<string>();
  for (const event of events) {
    if (visited.has(event.id)) continue;
    const active = new Set<string>();
    const stack: {id:string;exit:boolean}[] = [{id:event.id,exit:false}];
    let steps = 0;
    while (stack.length) {
      if (++steps > 200000) throw Error('EXPLANATION_GRAPH_LIMIT');
      const task = stack.pop()!;
      if (task.exit) { active.delete(task.id); visited.add(task.id); continue; }
      if (active.has(task.id)) throw Error('EXPLANATION_CAUSAL_CYCLE');
      if (visited.has(task.id)) continue;
      active.add(task.id);
      stack.push({id:task.id,exit:true});
      for (const parent of byEvent.get(task.id)!.parentIds) stack.push({id:parent,exit:false});
    }
  }
  let totalTraversal = 0;
  const views: ExplanationView[] = [];
  for (const event of events) {
    const ancestry = new Set<string>();
    const pending = [event.id];
    while (pending.length) {
      if (++totalTraversal > 500000) throw Error('EXPLANATION_GRAPH_LIMIT');
      const current = pending.pop()!;
      if (ancestry.has(current)) continue;
      ancestry.add(current);
      pending.push(...byEvent.get(current)!.parentIds);
    }
    const unknown = event.outcome === 'unknown' ||
      event.predicates.some(p => p.result === 'unknown') ||
      event.alternativeIds.length > 0;
    const warnings = [
      ...(unknown ? ['OUTCOME_UNRESOLVED'] : []),
      ...(event.alternativeIds.length ? ['UNRESOLVED_ALTERNATIVES'] : [])
    ];
    const rule = byRule.get(event.ruleId)!;
    views.push({
      eventId:event.id, state:unknown?'unresolved':'supported',outcome:event.outcome,
      ruleId:event.ruleId,
      causalEventIds:[...ancestry].sort((a,b)=>positions.get(a)!-positions.get(b)!),
      alternativeEventIds:[...event.alternativeIds],
      predicates:[...event.predicates],
      appliedExceptions:[...event.appliedExceptions],
      evidence:event.evidenceIds.map(k=>byEvidence.get(k)!),
      sourceExcerpts:event.sourceRefs.map(ref=>{
        const entry=resolve(ref);
        return {citation:entry.citation,exactQuote:ref.quote,versionId:ref.versionId,sourceDigest:ref.sourceDigest};
      }),
      publicText:authoredText(rule,event,unknown),warnings
    });
  }
  return {views,totalEvents:views.length,
    unresolvedEvents:views.filter(v=>v.state==='unresolved').length};
}
