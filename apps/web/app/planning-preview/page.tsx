import type {Metadata} from 'next';
import {planningPreviewAvailable,plannedPack,plannedStatus} from './data.ts';

export const metadata:Metadata={
  title:'Scenario planning preview | Law Machine',
  description:'Unverified hypothetical electronic-filing scenario inventory, not a statement of current law.',
  robots:{index:false,follow:false}
};

export default function PlanningPreview(){
 const available=planningPreviewAvailable();
 return <main className="planning-shell" id="main">
  <a className="back-link" href="/">← Return to Law Machine</a>
  <p className="eyebrow">LAW MACHINE / UNVERIFIED PLANNING PREVIEW</p>
  <h1>What might the model explore?</h1>
  <p className="intro">This is an editorial inventory of hypothetical situations. It is not a simulation, a bill text, a legal source, or a statement of current law.</p>
  <div className="planning-warning" role="note">
   <strong>No verified legislative source is attached.</strong>
   <p>Official baseline snapshots and the authentic complete proposed bill are missing. Nothing here can be executed, published as verified law, or used to make a real filing.</p>
  </div>
  <section aria-labelledby="planning-progress">
   <h2 id="planning-progress">Editorial preparation</h2>
   <p><strong>{plannedStatus.coverage.total}</strong> proposed cases · <strong>{plannedStatus.coverage.sourceAnchored}</strong> source-anchored cases · <strong>{plannedStatus.coverage.modelReady}</strong> verified executable models.</p>
   <p>{available?'These planning descriptions are available for review while source validation is pending.':'This preview is unavailable pending source-status review.'}</p>
  </section>
  {available&&<section aria-labelledby="planning-cases">
   <h2 id="planning-cases">Fourteen proposed scenario outlines</h2>
   <ol className="planning-list">
    {plannedPack.scenarios.map(s=><li key={s.id}>
      <h3><a href={'/planning-preview/'+encodeURIComponent(s.id)}>{s.title}</a></h3>
      <p className="planning-type">Hypothetical · planned only · no verified sources</p>
      <p>{s.expectedCheckpoints.length} conceptual checkpoints · {s.unresolved.length} unresolved questions</p>
    </li>)}
   </ol>
  </section>}
  <footer>Not legal advice. No actual filings are accepted; no government receipts or personal deadlines are calculated.</footer>
 </main>;
}
