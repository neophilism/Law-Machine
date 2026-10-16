'use client';

import { ActionButton, ErrorNotice, ExplainDialog, LoadingNotice, ModelTabs, StatusLabel } from '../components/primitives';

const views = [
  {
    id: 'journey',
    label: 'Follow a claim',
    content: <div className="preview-copy">
      <p className="eyebrow">01 / DOCUMENT JOURNEY</p>
      <h2>A document enters a fictional office.</h2>
      <p>A visitor will be able to follow the document as an agency receives it, decides what to do, and records an outcome. This is a non-operative layout preview; no simulation is running.</p>
      <div className="preview-steps" aria-label="Illustrative sequence">
        <span>Received</span><span aria-hidden="true">→</span><span>Reviewed</span><span aria-hidden="true">→</span><span>Explained</span>
      </div>
    </div>
  },
  {
    id: 'institutions',
    label: 'Explore institutions',
    content: <div className="preview-copy">
      <p className="eyebrow">02 / INSTITUTIONS</p>
      <h2>See the people and decisions in the system.</h2>
      <p>Institution cards will identify an actor, a claimed duty, and the precise source supporting it. The roles shown here are invented examples, not actual agency requirements.</p>
      <ul className="institution-list"><li>Fictional receiving office</li><li>Fictional review desk</li><li>Fictional decision officer</li></ul>
    </div>
  },
  {
    id: 'sources',
    label: 'Inspect sources',
    content: <div className="preview-copy">
      <p className="eyebrow">03 / SOURCE INSPECTION</p>
      <h2>Never lose the distinction between text and interpretation.</h2>
      <p>Future source inspectors will show an exact bill version, quoted provision, model assumption, and unresolved question side by side.</p>
      <p className="source-unavailable"><strong>Source unavailable:</strong> This design preview has no official legislative text attached.</p>
    </div>
  }
] as const;

export default function DesignPreview() {
  return <main id="main" className="design-shell">
    <header className="design-heading">
      <a className="back-link" href="/">← Law Machine home</a>
      <p className="eyebrow">LAW MACHINE / INTERACTION SYSTEM</p>
      <h1>A clearer path through the law.</h1>
      <p className="intro">A prototype of the controls that will eventually make a legal model navigable, understandable, and inspectable.</p>
      <div className="status-row" aria-label="Preview disclosures">
        <StatusLabel tone="draft" /><StatusLabel tone="hypothetical" /><StatusLabel tone="partial" />
      </div>
    </header>
    <div className="design-grid">
      <div className="design-art" aria-hidden="true">
        <svg viewBox="0 0 480 380" focusable="false">
          <rect x="76" y="92" width="328" height="232" rx="9" fill="#123c38" />
          <path d="M49 91L240 31 431 91Z" fill="#d9b781" stroke="#123c38" strokeWidth="6" />
          <path d="M90 112H390M90 309H390" stroke="#e9d8b4" strokeWidth="11" />
          {[120,190,260,330].map(x=><g key={x}><rect x={x} y="135" width="32" height="151" fill="#e9d8b4"/><rect x={x-6} y="127" width="44" height="13" fill="#e9d8b4"/><rect x={x-6} y="281" width="44" height="13" fill="#e9d8b4"/></g>)}
          <path d="M65 335H415" stroke="#123c38" strokeWidth="12" strokeLinecap="round"/>
          <rect x="206" y="206" width="70" height="80" rx="6" fill="#c27249" stroke="#123c38" strokeWidth="5" />
          <path d="M219 223H262M219 238H262M219 253H244" stroke="#fff6e6" strokeWidth="4" />
          <circle cx="365" cy="64" r="18" fill="#c27249"/>
        </svg>
        <p>Institutions • Documents • Decisions</p>
      </div>
      <section className="preview-panel" aria-label="Preview of interactive controls">
        <ModelTabs tabs={views} label="Example interaction views" />
        <div className="preview-actions">
          <ExplainDialog title="About this preview" trigger="What am I seeing?">
            <p>These are usable interface controls, not a working law simulator. Their copy and roles are fictional. Actual source-linked releases, deadlines, and event traces will be implemented in later milestones.</p>
            <p>Reading a preview never creates a filing, government receipt, or legal advice.</p>
          </ExplainDialog>
        </div>
      </section>
    </div>
    <section className="state-previews" aria-labelledby="state-heading">
      <p className="eyebrow">INTERFACE STATES / EXAMPLES ONLY</p>
      <h2 id="state-heading">Uncertainty is a visible state.</h2>
      <div className="state-grid">
        <LoadingNotice label="Loading a hypothetical source package…" />
        <ErrorNotice message="This example cannot resolve a source yet." />
      </div>
      <p><ActionButton disabled aria-describedby="disabled-note">Run simulation</ActionButton> <span id="disabled-note" className="microcopy">Unavailable until the simulation engine is implemented.</span></p>
    </section>
    <footer>Preview only. No actual filings are accepted. No account, real deadlines, or case-specific legal advice is offered.</footer>
  </main>;
}
