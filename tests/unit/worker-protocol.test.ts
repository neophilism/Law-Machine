import { describe,it,expect,vi } from 'vitest';
import {
  validateFixtureMessage,fallbackFixtureRun,MAX_FALLBACK_EVENTS,
  type FixtureWorkerRequest,type FixtureWorkerResponse
} from '../../packages/simulation/src/worker-protocol.ts';
import { FixtureWorkerClient, type WorkerPort }
  from '../../apps/web/app/lib/simulation-worker.ts';
import type { ScheduledEvent } from '../../packages/simulation/src/scheduler.ts';
const events=(count:number): ScheduledEvent[]=>Array.from({length:count},(_,i)=>({
  id:'fixture-'+i,tick:i,actorId:'toy-desk',kind:'toy-step',
  causeId:i===0?null:'fixture-'+(i-1),sourceRefs:['toy-source']
}));
const request=(count:number)=>({type:'run',mode:'fictional-fixture',runId:'toy',
  generation:1,events:events(count)} as const);
describe('LM-029 bounded worker protocol',()=>{
  it('validates typed requests and rejects duplicate, malformed or excessive events',()=>{
    expect(validateFixtureMessage(request(2)).type).toBe('run');
    expect(()=>validateFixtureMessage({...request(2),events:[events(1)[0],events(1)[0]]}))
      .toThrow('WORKER_EVENT_DUPLICATE');
    expect(()=>validateFixtureMessage({...request(2),runId:'../unsafe'}))
      .toThrow('WORKER_ID_INVALID');
    expect(()=>validateFixtureMessage({...request(2),events:events(10001)}))
      .toThrow('WORKER_REQUEST_INVALID');
    expect(()=>validateFixtureMessage({...request(2),mode:'real-law'}))
      .toThrow('WORKER_REQUEST_INVALID');
  });
  it('uses a bounded fallback that produces exactly the deterministic scheduler events',()=>{
    const completed=fallbackFixtureRun(request(3));
    expect(completed.type).toBe('complete');
    if(completed.type!=='complete')throw Error('fixture unexpectedly failed');
    expect(completed.trace.map(e=>e.id)).toEqual(['fixture-0','fixture-1','fixture-2']);
    expect(completed.warnings).toContain('WORKER_UNAVAILABLE_BOUNDED_FALLBACK');
    expect(fallbackFixtureRun(request(MAX_FALLBACK_EVENTS+1))).toMatchObject({
      type:'error',code:'FALLBACK_EVENT_LIMIT'
    });
  });
  it('never lets old worker completions overwrite a newer generation',async()=>{
    const listeners:Partial<Record<'message'|'error'|'messageerror',(event: unknown) => void>>={};
    const port={
      postMessage:vi.fn((_r:FixtureWorkerRequest)=>undefined),
      terminate:vi.fn(),
      addEventListener:vi.fn((type:'message'|'error'|'messageerror',fn:(event: unknown) => void)=>{listeners[type]=fn;})
    } as unknown as WorkerPort;
    const client=new FixtureWorkerClient(()=>port);
    const first=client.run('old',events(2));
    const second=client.run('new',events(2));
    const old=await first;
    expect(old.type).toBe('cancelled');
    const emit=(data:FixtureWorkerResponse)=>listeners.message?.({data});
    emit({type:'complete',runId:'old',generation:1,trace:[],diagnostic:null,warnings:[]});
    emit({type:'complete',runId:'new',generation:2,trace:[],diagnostic:null,warnings:[]});
    expect((await second).type).toBe('complete');
    client.dispose();
    expect(port.terminate).toHaveBeenCalled();
  });
  it('fails closed and allows a fresh worker after a runtime crash',async()=>{
    const ports:WorkerPort[]=[];
    const listeners:((event:{data:FixtureWorkerResponse})=>void)[]=[];
    const client=new FixtureWorkerClient(()=>{
      const port={
        postMessage:vi.fn(),terminate:vi.fn(),
        addEventListener:vi.fn((type:string,cb:(event: unknown) => void)=>{
          if(type==='error') (port as {crash?:(event: unknown) => void}).crash=cb;
          if(type==='message')listeners.push(cb as (event:{data:FixtureWorkerResponse})=>void);
        })
      } as unknown as WorkerPort;
      ports.push(port);return port;
    });
    const first=client.run('before',events(1));
    (ports[0] as WorkerPort & {crash?:()=>void}).crash?.();
    expect(await first).toMatchObject({type:'error',code:'WORKER_CRASH'});
    const second=client.run('after',events(1));
    listeners[1]?.({data:{type:'complete',runId:'after',generation:2,trace:[],diagnostic:null,warnings:[]}});
    expect((await second).type).toBe('complete');
    expect(ports).toHaveLength(2);
    client.dispose();
  });
});
