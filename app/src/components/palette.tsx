import { useEffect, useMemo, useState } from "react";
import { Field } from "@/components/ui/field";
import { NAV, type NavId } from "@/lib/hha/constants";
import { hydrateCase, hydrateTask } from "@/lib/hha/logic";
import { useHha } from "@/lib/hha/store";

export function Palette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const setNav = useHha((s) => s.setNav);
  const setOpenItem = useHha((s) => s.setOpenItem);
  const setJarvisOpen = useHha((s) => s.setJarvisOpen);
  const cases = useHha((s) => s.cases);
  const tasks = useHha((s) => s.tasks);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (open) setQ("");
  }, [open]);

  const items = useMemo(() => {
    const term = q.trim().toLowerCase();
    const mods = [
      ...NAV.map((n) => ({ id: "nav:" + n.id, label: n.label, meta: n.kicker, run: () => setNav(n.id as NavId) })),
      { id: "jarvis", label: "JARVIS", meta: "Ask the desk officer", run: () => setJarvisOpen(true) },
    ];
    const recs = [
      ...Object.values(cases).map(hydrateCase),
      ...Object.values(tasks).map(hydrateTask),
    ].slice(0, 40).map((c) => ({
      id: c.kind + ":" + c.id,
      label: c.displayName,
      meta: (c.kind === "task" ? "Action" : "Referral") + " · " + (c.status || ""),
      run: () => setOpenItem(c.kind + ":" + c.id),
    }));
    return [...mods, ...recs].filter((r) =>
      !term ? true : (r.label + " " + r.meta).toLowerCase().includes(term),
    ).slice(0, 18);
  }, [q, cases, tasks, setNav, setOpenItem, setJarvisOpen]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-[12vh]" onClick={onClose}>
      <div
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-surface p-2 shadow-[var(--shadow-panel)]"
        onClick={(e) => e.stopPropagation()}
      >
        <Field
          autoFocus
          placeholder="Jump to a module, case, or action…"
          className="border-0 text-base shadow-none focus:ring-0"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            if (e.key === "Enter" && items[0]) {
              items[0].run();
              onClose();
            }
          }}
        />
        <div className="scroll mt-1 max-h-[50vh] overflow-auto">
          {items.map((r) => (
            <button
              key={r.id}
              type="button"
              className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left hover:bg-surface-2"
              onClick={() => {
                r.run();
                onClose();
              }}
            >
              <span className="truncate text-sm font-medium">{r.label}</span>
              <span className="shrink-0 text-[11px] text-muted">{r.meta}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
