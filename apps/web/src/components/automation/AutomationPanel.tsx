import { useState, type ReactNode } from 'react';
import '../../styles/automation.css';

export function AutomationPanel({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <details className="automation-panel" onToggle={(event) => { if (event.currentTarget.open) setOpen(true); }}>
    <summary>{title}</summary>{open && <div className="automation-body">{children}</div>}
  </details>;
}

export function AutomationError({ error }: { error?: string }) { return error ? <p role="alert" className="automation-error">{error}</p> : null; }
