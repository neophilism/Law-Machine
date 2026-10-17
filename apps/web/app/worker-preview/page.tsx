'use client';

import { useEffect, useRef, useState } from 'react';
import { FixtureWorkerClient } from '../lib/simulation-worker.ts';
import type { ScheduledEvent } from '../../../../packages/simulation/src/scheduler.ts';

function syntheticEvents(count: number): ScheduledEvent[] {
  return Array.from({length:count},(_,i)=>({
    id:'fixture-'+i, tick:i,
    actorId:'fictional-desk',kind:'fictional-transition',
    causeId:i===0?null:'fixture-'+(i-1),sourceRefs:['fictional-toy-source']
  }));
}
export default function WorkerPreview() {
  const client=useRef<FixtureWorkerClient|null>(null);
  const currentRequest=useRef(0);
  const [status,setStatus]=useState<'idle'|'running'|'completed'|'cancelled'|'error'>('idle');
  const [processed,setProcessed]=useState(0);
  const [total,setTotal]=useState(0);
  const [diagnostic,setDiagnostic]=useState('');
  useEffect(()=>{
    client.current=new FixtureWorkerClient();
    return ()=>{currentRequest.current++;client.current?.dispose();client.current=null;};
  },[]);
  const start=async(count:number)=>{
    const ticket=++currentRequest.current;
    const runner=client.current;
    if(!runner){setDiagnostic('Worker client not initialized');setStatus('error');return;}
    setStatus('running');setProcessed(0);setTotal(count);setDiagnostic('');
    try{
      const outcome=await runner.run('toy-fixture',syntheticEvents(count),report=>{
        if(ticket===currentRequest.current)setProcessed(report.processed);
      });
      if(ticket!==currentRequest.current)return;
      if(outcome.type==='complete'){
        setStatus('completed');setProcessed(outcome.trace.length);
        setDiagnostic(outcome.warnings.join(', '));
      }else if(outcome.type==='cancelled')setStatus('cancelled');
      else {setStatus('error');setDiagnostic(outcome.code);}
    }catch(error){
      if(ticket!==currentRequest.current)return;
      setStatus('error');setDiagnostic(error instanceof Error?error.message:'WORKER_FAILURE');
    }
  };
  const cancel=()=>{
    currentRequest.current++;
    client.current?.cancel();
    setStatus('cancelled');
    setDiagnostic('The previous run cannot update this view.');
  };
  return <main id="main" className="design-shell">
    <a href="/" className="back-link">← Law Machine</a>
    <p className="eyebrow">LAW MACHINE / WORKER TEST FIXTURE</p>
    <h1 style={{maxWidth:'17ch'}}>Simulation responsiveness laboratory</h1>
    <p className="intro">An explicitly fictional scheduling demonstration. These events describe no real legal claim, agency duty, filing or enacted law.</p>
    <section aria-labelledby="worker-controls">
      <h2 id="worker-controls">Run a bounded fixture</h2>
      <p>Actions below use a dedicated browser worker where supported. When unavailable, only smaller fixtures can run synchronously with an explicit warning.</p>
      <div style={{display:'flex',flexWrap:'wrap',gap:'.8rem'}}>
        <button type="button" onClick={()=>void start(120)} disabled={status==='running'}>Run short fictional fixture</button>
        <button type="button" onClick={()=>void start(5000)} disabled={status==='running'}>Run long fictional fixture</button>
        <button type="button" onClick={cancel} disabled={status!=='running'}>Cancel current run</button>
      </div>
      <p role="status" aria-live="polite" data-testid="worker-status">
        {status==='running'?'Processing fictional events':status==='completed'
          ?'Completed '+processed+' of '+total+' fictional events'
          :status==='cancelled'?'Run cancelled':status==='error'?'Run could not complete':'Fixture not started'}
      </p>
      <progress aria-label="Fictional events processed" max={Math.max(total,1)} value={processed}/>
      <p data-testid="worker-diagnostic">{diagnostic}</p>
    </section>
    <footer>Fictional fixtures only. No actual filings are accepted; a production legal simulator and published source pack are separate milestones.</footer>
  </main>;
}
