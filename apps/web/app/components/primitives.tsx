'use client';

import { useEffect, useId, useRef, useState, type ComponentProps, type ReactNode, type KeyboardEvent } from 'react';

export type LabelTone = 'draft' | 'hypothetical' | 'partial' | 'unverified';
const labels: Record<LabelTone, string> = {
  draft: 'Draft proposal',
  hypothetical: 'Hypothetical example',
  partial: 'Partial coverage',
  unverified: 'Not verified'
};

/** Labels always carry words and cannot communicate state by color alone. */
export function StatusLabel({ tone }: { tone: LabelTone }) {
  return <span className={'status-label status-label--' + tone}>{labels[tone]}</span>;
}

type ActionButtonProps = ComponentProps<'button'> & { variant?: 'primary' | 'secondary' };
export function ActionButton({ variant = 'primary', className = '', type = 'button', children, ...props }: ActionButtonProps) {
  return <button {...props} type={type} className={'lm-button lm-button--' + variant + ' ' + className}>{children}</button>;
}

export interface ModelTab {
  readonly id: string;
  readonly label: string;
  readonly content: ReactNode;
}

/** Automatic-activation tabs with roving tab index, arrow/Home/End navigation. */
export function ModelTabs({ tabs, label }: { tabs: readonly ModelTab[]; label: string }) {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const prefix = useId().replace(/:/g, '');
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault();
    setActive(next);
    refs.current[next]?.focus();
  }
  if (tabs.length === 0) return null;
  return <div className="model-tabs">
    <div className="tab-strip" role="tablist" aria-label={label}>
      {tabs.map((tab, index) => <button
        key={tab.id} id={prefix + '-tab-' + tab.id} role="tab" type="button"
        aria-controls={prefix + '-panel-' + tab.id}
        aria-selected={active === index}
        tabIndex={active === index ? 0 : -1}
        ref={node => { refs.current[index] = node; }}
        onClick={() => setActive(index)}
        onKeyDown={event => onKeyDown(event,index)}
      >{tab.label}</button>)}
    </div>
    {tabs.map((tab, index) => <div
      key={tab.id} role="tabpanel" id={prefix + '-panel-' + tab.id}
      aria-labelledby={prefix + '-tab-' + tab.id} hidden={active !== index}
      tabIndex={0} className="tab-panel"
    >{tab.content}</div>)}
  </div>;
}

/** Native modal dialog supplies focus containment, Escape and backdrop semantics. */
export function ExplainDialog({ title, trigger, children }: { title: string; trigger: string; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const headingId = useId();
  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (open && !node.open) node.showModal();
    else if (!open && node.open) node.close();
  }, [open]);
  return <>
    <ActionButton ref={opener} variant="secondary" onClick={() => setOpen(true)}>{trigger}</ActionButton>
    <dialog ref={dialog} className="explain-dialog" aria-labelledby={headingId} onClose={() => {
      setOpen(false); opener.current?.focus();
    }}>
      <div className="dialog-content">
        <h2 id={headingId}>{title}</h2>
        <div>{children}</div>
        <ActionButton onClick={() => dialog.current?.close()}>Close explanation</ActionButton>
      </div>
    </dialog>
  </>;
}


/** A reusable inspector boundary; source availability is explicit. */
export function SourceInspector({ label, children }: { label: string; children: ReactNode }) {
  return <aside className="source-inspector" aria-label={label}>
    <div className="source-inspector__header"><strong>{label}</strong><StatusLabel tone="unverified" /></div>
    <div className="source-inspector__content">{children}</div>
  </aside>;
}

export function LoadingNotice({ label }: { label: string }) {
  return <p role="status" className="status-notice"><span className="notice-mark" aria-hidden="true">…</span>{label}</p>;
}

export function ErrorNotice({ message }: { message: string }) {
  return <div role="alert" className="error-notice"><strong>Cannot continue.</strong> {message}</div>;
}
