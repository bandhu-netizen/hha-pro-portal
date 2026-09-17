import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Eyebrow, Field, Panel } from "@/components/ui/field";
import { useHha } from "@/lib/hha/store";
import { cn } from "@/lib/utils";

export function Settings() {
  const name = useHha((s) => s.name);
  const setName = useHha((s) => s.setName);
  const theme = useHha((s) => s.theme);
  const setTheme = useHha((s) => s.setTheme);
  const compact = useHha((s) => s.compact);
  const setCompact = useHha((s) => s.setCompact);
  const [draft, setDraft] = useState(name);

  return (
    <Panel className="max-w-xl p-6">
      <div className="font-display text-2xl">Systems</div>
      <div className="mt-5">
        <Eyebrow className="mb-2">Appearance</Eyebrow>
        <div className="flex gap-2">
          {(["system", "light", "dark"] as const).map((t) => (
            <Button key={t} variant={theme === t ? "primary" : "secondary"} onClick={() => setTheme(t)}>
              {t[0]!.toUpperCase() + t.slice(1)}
            </Button>
          ))}
        </div>
      </div>
      <div className="mt-6">
        <Eyebrow className="mb-2">Display name</Eyebrow>
        <p className="mb-3 text-sm text-muted">Asked once at first open. JARVIS uses this on notes and briefings.</p>
        <div className="flex flex-wrap gap-2">
          <Field
            className="min-w-52 flex-1"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Your name"
          />
          <Button
            variant="primary"
            onClick={() => {
              if (!draft.trim()) return;
              setName(draft.trim());
              toast.success("Name saved");
            }}
          >
            Save name
          </Button>
        </div>
      </div>
      <div className="mt-6">
        <Eyebrow className="mb-2">Workspace</Eyebrow>
        <label className={cn("flex items-center gap-2 text-sm")}>
          <input type="checkbox" checked={compact} onChange={(e) => setCompact(e.target.checked)} />
          Compact sidebar
        </label>
        <p className="mt-2 text-sm text-muted">
          ⌘K search · ⌘J JARVIS · ⌘N log action · 1–5 modules · J/K move list
        </p>
      </div>
      <p className="mt-6 text-xs text-faint">
        HHA Pro stays in this browser. Export or clear the pipeline from Pipeline. Network edits save locally when the live API is unreachable.
      </p>
    </Panel>
  );
}
