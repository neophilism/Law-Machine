import {
  validateFixtureMessage, fallbackFixtureRun,
  type FixtureWorkerRequest, type FixtureWorkerResponse,
  type FixtureWorkerRun, type FixtureTerminal, type FixtureProgress
} from '../../../../packages/simulation/src/worker-protocol.ts';
import type { ScheduledEvent } from '../../../../packages/simulation/src/scheduler.ts';

export type WorkerPort = {
  postMessage(message: FixtureWorkerRequest): void;
  terminate(): void;
  addEventListener(type: 'message', handler: (event: MessageEvent<FixtureWorkerResponse>) => void): void;
  addEventListener(type: 'error', handler: (event: Event) => void): void;
  addEventListener(type: 'messageerror', handler: (event: Event) => void): void;
};
type Pending = {
  readonly request: FixtureWorkerRun;
  readonly resolve: (value: FixtureTerminal) => void;
  readonly progress: ((message: FixtureProgress) => void) | undefined;
};
const defaultFactory = (): WorkerPort | null => {
  if (typeof Worker === 'undefined') return null;
  return new Worker(new URL('../workers/simulation.worker.ts', import.meta.url),
    {type:'module'}) as WorkerPort;
};

/**
 * Latest generation wins. All late events are discarded, and crashed workers
 * are terminated instead of replaying potentially duplicated results.
 */
export class FixtureWorkerClient {
  private port: WorkerPort | null = null;
  private sequence = 0;
  private pending: Pending | null = null;
  constructor(private readonly factory: () => WorkerPort | null = defaultFactory) {}
  private ensurePort(): WorkerPort | null {
    if (this.port) return this.port;
    try { this.port = this.factory(); } catch { this.port = null; }
    if (!this.port) return null;
    const port = this.port;
    port.addEventListener('message', message => {
      if (this.port !== port) return;
      const current = this.pending;
      const result = message.data;
      if (!current || !result || result.generation !== current.request.generation ||
          result.runId !== current.request.runId) return;
      if (result.type==='progress') {
        current.progress?.(result);
        return;
      }
      if (result.type==='complete'||result.type==='cancelled'||result.type==='error') {
        this.pending=null;
        current.resolve(result);
      }
    });
    const fail = () => {
      if (this.port!==port) return;
      this.port=null;
      port.terminate();
      const current=this.pending;
      this.pending=null;
      if(current)current.resolve({type:'error',runId:current.request.runId,
        generation:current.request.generation,code:'WORKER_CRASH'});
    };
    port.addEventListener('error',fail);
    port.addEventListener('messageerror',fail);
    return port;
  }
  run(runId: string, events: readonly ScheduledEvent[],
    onProgress?: (status: FixtureProgress) => void): Promise<FixtureTerminal> {
    this.cancel();
    const request=validateFixtureMessage({
      type:'run',mode:'fictional-fixture',runId,
      generation:++this.sequence,events
    }) as FixtureWorkerRun;
    const port=this.ensurePort();
    if (!port) return Promise.resolve(fallbackFixtureRun(request));
    return new Promise(resolve => {
      this.pending={request,resolve,progress:onProgress};
      try { port.postMessage(request); }
      catch {
        port.terminate();
        this.port=null; this.pending=null;
        resolve(fallbackFixtureRun(request));
      }
    });
  }
  cancel(): void {
    const pending=this.pending;
    if (!pending) return;
    this.pending=null;
    try {
      this.port?.postMessage({type:'cancel',runId:pending.request.runId,
        generation:pending.request.generation});
    } catch { this.port?.terminate(); this.port=null; }
    pending.resolve({type:'cancelled',runId:pending.request.runId,
      generation:pending.request.generation});
  }
  dispose(): void {
    this.cancel();
    this.port?.terminate();
    this.port=null;
  }
}
