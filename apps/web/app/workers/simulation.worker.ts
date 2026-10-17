import { DeterministicScheduler } from '../../../../packages/simulation/src/scheduler.ts';
import {
  validateFixtureMessage, MAX_WORKER_EVENTS,
  type FixtureWorkerResponse, type FixtureWorkerRun
} from '../../../../packages/simulation/src/worker-protocol.ts';

const port = self as unknown as {
  postMessage(message: FixtureWorkerResponse): void;
  addEventListener(type: 'message', handler: (event: MessageEvent<unknown>) => void): void;
};
type Active = {
  readonly request: FixtureWorkerRun;
  readonly scheduler: DeterministicScheduler;
  cancelled: boolean;
};
let current: Active | null = null;
const send = (message: FixtureWorkerResponse): void => port.postMessage(message);
function stop(run: Active): void {
  if (run.cancelled) return;
  run.cancelled = true;
  run.scheduler.cancel();
  send({type:'cancelled',runId:run.request.runId,generation:run.request.generation});
}
function batch(run: Active): void {
  if (run.cancelled || current !== run) return;
  // Bounded batches relinquish the worker event loop to receive cancellations.
  for(let n=0;n<64;n++){
    if (!run.scheduler.step()) break;
  }
  const snapshot=run.scheduler.snapshot();
  if (snapshot.status === 'stopped') {
    send({type:'error',runId:run.request.runId,generation:run.request.generation,
      code:snapshot.diagnostic?.code ?? 'WORKER_RUN_STOPPED'});
    if (current===run)current=null;
    return;
  }
  if (snapshot.pending.length>0) {
    send({type:'progress',runId:run.request.runId,generation:run.request.generation,
      processed:snapshot.trace.length,total:run.request.events.length});
    setTimeout(()=>batch(run),0);
    return;
  }
  // step() on empty queue finalizes the scheduler's completion status.
  run.scheduler.step();
  const completed=run.scheduler.snapshot();
  send({type:'complete',runId:run.request.runId,generation:run.request.generation,
    trace:completed.trace,diagnostic:completed.diagnostic,warnings:[]});
  if(current===run)current=null;
}
port.addEventListener('message', event => {
  let request;
  try {request=validateFixtureMessage(event.data);}
  catch {
    const raw=event.data as {runId?:unknown;generation?:unknown}|null;
    send({type:'error',runId:typeof raw?.runId==='string'?raw.runId:'unknown',
      generation:typeof raw?.generation==='number'?raw.generation:0,
      code:'WORKER_MESSAGE_INVALID'});
    return;
  }
  if (request.type==='cancel') {
    if(current && current.request.generation===request.generation &&
       current.request.runId===request.runId) {
      stop(current);current=null;
    }
    return;
  }
  if(current)stop(current);
  const scheduler=new DeterministicScheduler(MAX_WORKER_EVENTS,1000);
  for(const item of request.events)if(!scheduler.schedule(item)){
    send({type:'error',runId:request.runId,generation:request.generation,
      code:scheduler.snapshot().diagnostic?.code ?? 'WORKER_SCHEDULE_INVALID'});
    current=null;
    return;
  }
  const run: Active={request,scheduler,cancelled:false};
  current=run;
  setTimeout(()=>batch(run),0);
});
