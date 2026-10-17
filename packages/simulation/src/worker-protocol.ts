import { canonicalJSON } from '../../contracts/src/integrity.ts';
import {
  DeterministicScheduler, type ScheduledEvent, type TraceEvent,
  type SchedulerDiagnostic
} from './scheduler.ts';

/** Worker runs only bounded, explicitly fictional fixtures until LM-030. */
export const MAX_WORKER_EVENTS = 10000;
export const MAX_FALLBACK_EVENTS = 256;
export type FixtureWorkerRun = {
  readonly type: 'run';
  readonly mode: 'fictional-fixture';
  readonly runId: string;
  readonly generation: number;
  readonly events: readonly ScheduledEvent[];
};
export type FixtureWorkerCancel = {
  readonly type: 'cancel';
  readonly runId: string;
  readonly generation: number;
};
export type FixtureWorkerRequest = FixtureWorkerRun | FixtureWorkerCancel;
export type FixtureProgress = {
  readonly type: 'progress';
  readonly runId: string;
  readonly generation: number;
  readonly processed: number;
  readonly total: number;
};
export type FixtureCompleted = {
  readonly type: 'complete';
  readonly runId: string;
  readonly generation: number;
  readonly trace: readonly TraceEvent[];
  readonly diagnostic: SchedulerDiagnostic | null;
  readonly warnings: readonly string[];
};
export type FixtureCancelled = {
  readonly type: 'cancelled';
  readonly runId: string;
  readonly generation: number;
};
export type FixtureFailure = {
  readonly type: 'error';
  readonly runId: string;
  readonly generation: number;
  readonly code: string;
};
export type FixtureWorkerResponse =
  FixtureProgress | FixtureCompleted | FixtureCancelled | FixtureFailure;
export type FixtureTerminal =
  FixtureCompleted | FixtureCancelled | FixtureFailure;

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const id = (v: unknown): v is string => typeof v === 'string' && IDENTIFIER.test(v);
const generation = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const validEvent = (v: ScheduledEvent): boolean =>
  !!v && id(v.id) && generation(v.tick) && id(v.actorId) && id(v.kind) &&
  (v.causeId === null || id(v.causeId)) && Array.isArray(v.sourceRefs) &&
  v.sourceRefs.length > 0 && v.sourceRefs.length <= 100 &&
  v.sourceRefs.every(id);
export function validateFixtureMessage(input: unknown): FixtureWorkerRequest {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw Error('WORKER_MESSAGE_INVALID');
  const message = input as Record<string, unknown>;
  if (!id(message.runId) || !generation(message.generation))
    throw Error('WORKER_ID_INVALID');
  if (message.type === 'cancel')
    return { type: 'cancel', runId:message.runId, generation:message.generation };
  if (message.type !== 'run' || message.mode !== 'fictional-fixture' ||
      !Array.isArray(message.events) || message.events.length > MAX_WORKER_EVENTS)
    throw Error('WORKER_REQUEST_INVALID');
  const serialized = canonicalJSON(message);
  if (serialized.length > 2_000_000) throw Error('WORKER_PAYLOAD_LIMIT');
  if (!message.events.every(validEvent)) throw Error('WORKER_EVENT_INVALID');
  const names = new Set(message.events.map((event: ScheduledEvent) => event.id));
  if (names.size !== message.events.length) throw Error('WORKER_EVENT_DUPLICATE');
  return message as FixtureWorkerRun;
}
export function fallbackFixtureRun(input: unknown): FixtureTerminal {
  const req = validateFixtureMessage(input);
  if (req.type !== 'run') throw Error('WORKER_FALLBACK_EXPECTED_RUN');
  if (req.events.length > MAX_FALLBACK_EVENTS)
    return {type:'error',runId:req.runId,generation:req.generation,code:'FALLBACK_EVENT_LIMIT'};
  const scheduler=new DeterministicScheduler(MAX_FALLBACK_EVENTS,MAX_FALLBACK_EVENTS);
  for (const item of req.events) {
    if (!scheduler.schedule(item))
      return {type:'error',runId:req.runId,generation:req.generation,
        code:scheduler.snapshot().diagnostic?.code ?? 'FALLBACK_SCHEDULE_FAILED'};
  }
  const result=scheduler.run();
  if (result.status !== 'completed')
    return {type:'error',runId:req.runId,generation:req.generation,
      code:result.diagnostic?.code ?? 'FALLBACK_INCOMPLETE'};
  return {type:'complete',runId:req.runId,generation:req.generation,
    trace:result.trace,diagnostic:result.diagnostic,
    warnings:['WORKER_UNAVAILABLE_BOUNDED_FALLBACK']};
}
