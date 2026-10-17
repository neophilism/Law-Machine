import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {planningPreviewAvailable,plannedPack} from '../data.ts';

type Props={params:Promise<{scenarioId:string}>};
const getScenario=(id:string)=>plannedPack.scenarios.find(s=>s.id===id);

export const dynamicParams=false;
export function generateStaticParams(){return plannedPack.scenarios.map(s=>({scenarioId:s.id}));}
export async function generateMetadata({params}:Props):Promise<Metadata>{
 const {scenarioId}=await params;
 const title=getScenario(scenarioId)?.title??'Unavailable planning scenario';
 return {title:title+' | Law Machine (unverified planning)',robots:{index:false,follow:false}};
}
export default async function PlannedScenario({params}:Props){
 const {scenarioId}=await params;
 if(!planningPreviewAvailable())notFound();
 const s=getScenario(scenarioId);
 if(!s)notFound();
 return <main className="planning-shell planning-detail" id="main">
   <a href="/planning-preview" className="back-link">← Back to planning inventory</a>
   <p className="eyebrow">UNVERIFIED HYPOTHETICAL / NOT A LEGAL SIMULATION</p>
   <h1>{s.title}</h1>
   <div className="planning-warning" role="note">
    <strong>Not authoritative law or a published model.</strong>
    <p>No verified provision, official baseline, enactment finding or executable trace is available. These checkpoints are editorial questions, not legally required steps or deadlines.</p>
   </div>
   <section aria-labelledby="proposed-checkpoints">
    <h2 id="proposed-checkpoints">Questions to model after source verification</h2>
    <ol className="planning-checkpoints">{s.expectedCheckpoints.map(c=><li key={c}>{c.replaceAll('-',' ')}</li>)}</ol>
   </section>
   <section aria-labelledby="proposed-assumptions">
    <h2 id="proposed-assumptions">Hypothetical assumptions</h2>
    <ul>{s.assumptions.map(a=><li key={a.id}>{a.id.replaceAll('-',' ')} — unverified</li>)}</ul>
   </section>
   <section aria-labelledby="proposed-unknowns">
    <h2 id="proposed-unknowns">Unresolved source questions</h2>
    <ul>{s.unresolved.map((item,i)=><li key={i}>{item}</li>)}</ul>
   </section>
   <p><a href="/planning-preview">Explore the other planned scenarios</a></p>
   <footer>No actual filings or official receipts. Do not use this page to calculate personal legal deadlines.</footer>
 </main>;
}
