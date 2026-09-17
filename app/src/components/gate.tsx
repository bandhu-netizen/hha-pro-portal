import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { useHha } from "@/lib/hha/store";

export function Gate() {
  const name = useHha((s) => s.name);
  const setName = useHha((s) => s.setName);
  const hydrated = useHha((s) => s.hydrated);
  const [draft, setDraft] = useState("");
  const [err, setErr] = useState(false);

  if (!hydrated || name.trim()) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg px-4">
      <div className="relative w-full max-w-md rounded-2xl border border-line bg-surface p-8 shadow-[var(--shadow-panel)]">
        <div className="mb-5 grid size-12 place-items-center rounded-lg bg-accent font-display text-2xl font-semibold text-accent-fg">
          H
        </div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
          Cottage Homecare
        </div>
        <h1 className="mt-1 font-display text-4xl font-medium tracking-tight">Systems online.</h1>
        <p className="mt-2 text-sm text-muted">
          Identify yourself. JARVIS will use this name on notes, actions, and the morning brief.
        </p>
        <label className="mt-5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-faint" htmlFor="gateName">
          Your name
        </label>
        <Field
          id="gateName"
          autoFocus
          placeholder="First and last name"
          autoComplete="name"
          className="mt-1"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setErr(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              if (!draft.trim()) setErr(true);
              else setName(draft.trim());
            }
          }}
        />
        {err ? <p className="mt-2 text-xs text-crit">A name, if you please.</p> : null}
        <Button
          variant="primary"
          size="lg"
          className="mt-4 w-full"
          onClick={() => {
            if (!draft.trim()) setErr(true);
            else setName(draft.trim());
          }}
        >
          Continue to the desk
        </Button>
        <p className="mt-4 text-[11px] text-faint">Saved only in this browser. Change it later in Systems.</p>
      </div>
    </div>
  );
}
