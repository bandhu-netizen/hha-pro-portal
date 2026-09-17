import { useMemo } from "react";
import { toast } from "sonner";
import { Dropzone } from "@/components/dropzone";
import { Button } from "@/components/ui/button";
import { Eyebrow, Kpi, Panel } from "@/components/ui/field";
import {
  greeting,
  groupByState,
  hydrateCase,
  hydrateTask,
  isClosed,
  isScreening,
  localBriefing,
  pipelineStats,
  stateLabel,
  workQueue,
} from "@/lib/hha/logic";
import { speakLocal } from "@/lib/hha/notify";
import { useHha } from "@/lib/hha/store";
import { cn } from "@/lib/utils";

export function Overview() {
  const name = useHha((s) => s.name);
  const rawCases = useHha((s) => s.cases);
  const rawTasks = useHha((s) => s.tasks);
  const ovState = useHha((s) => s.ovState);
  const setOvState = useHha((s) => s.setOvState);
  const setNav = useHha((s) => s.setNav);
  const setFilters = useHha((s) => s.setFilters);
  const setOpenItem = useHha((s) => s.setOpenItem);
  const ingestFiles = useHha((s) => s.ingestFiles);
  const addCaseNote = useHha((s) => s.addCaseNote);
  const nprefs = useHha((s) => s.nprefs);
  const pushJarvis = useHha((s) => s.pushJarvis);
  const setJarvisOpen = useHha((s) => s.setJarvisOpen);

  const allCases = useMemo(() => Object.values(rawCases).map(hydrateCase), [rawCases]);
  const allTasks = useMemo(() => Object.values(rawTasks).map(hydrateTask), [rawTasks]);
  const byState = groupByState(allCases);
  const cases = ovState === "all" ? allCases : allCases.filter((c) => (c.state || "GENERAL") === ovState);
  const st = pipelineStats(cases, allTasks);
  const queue = workQueue(
    ovState === "all" ? allCases : cases,
    allTasks,
    name,
    5,
  );

  const statuses = Object.entries(st.statuses)
    .sort((a, b) => b[1] - a[1])
    .map(([label, n]) => ({ label, n }));
  const intakes: Record<string, number> = {};
  const sources: Record<string, number> = {};
  cases.forEach((c) => {
    if (c.intake) intakes[c.intake] = (intakes[c.intake] || 0) + 1;
    if (c.source) sources[c.source] = (sources[c.source] || 0) + 1;
  });

  function jump(kind: string, status?: string) {
    setFilters({
      kpi: kind === "stale" ? "stale" : kind === "week" ? "week" : kind === "screen" ? "screen" : null,
      status: kind === "screen" ? "__screen__" : kind === "status" && status ? status : "all",
      state: ovState === "all" ? "all" : ovState,
      kind: "all",
      view: "rank",
    });
    setNav("pipeline");
  }

  async function onFiles(files: File[]) {
    const res = await ingestFiles(files);
    if (res.total) toast.success(`Ingested ${res.total} referrals`);
    res.errors.forEach((e) => toast.error(e));
    if (res.total) setNav("pipeline");
  }

  const maxStatus = Math.max(1, ...statuses.map((e) => e.n));
  const people = Object.entries(intakes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  const src = Object.entries(sources)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Eyebrow>{greeting(name)}</Eyebrow>
          <h2 className="font-display text-3xl font-medium tracking-tight">
            {ovState === "all" ? "Command deck" : stateLabel(ovState)}
          </h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              const say = localBriefing(name, allCases, allTasks, queue);
              pushJarvis({ role: "jarvis", text: say });
              setJarvisOpen(true);
              if (nprefs.voice) speakLocal(say);
            }}
          >
            Speak briefing
          </Button>
          <Button variant="primary" onClick={() => document.getElementById("hha-file")?.click()}>
            Import reports
          </Button>
        </div>
      </div>

      {byState.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {[["all", allCases.length] as const, ...byState.map(([k, list]) => [k, list.length] as const)].map(
            ([k, n]) => (
              <button
                key={k}
                type="button"
                onClick={() => setOvState(k)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors duration-150",
                  ovState === k
                    ? "border-transparent bg-accent text-accent-fg"
                    : "border-line-strong bg-surface text-fg hover:bg-surface-2",
                )}
              >
                {k === "all" ? "All states" : stateLabel(k)} · {n}
              </button>
            ),
          )}
        </div>
      ) : null}

      {!allCases.length ? (
        <Dropzone onFiles={onFiles} label="Drop one or more HHA reports" />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 stagger-in">
            <Kpi n={cases.length} label="Cases in view" onClick={() => jump("all")} />
            <Kpi n={st.screening} label="Initial screening" tone="accent" onClick={() => jump("screen")} />
            <Kpi n={st.stale} label="Stale 14+ days" tone="crit" onClick={() => jump("stale")} />
            <Kpi n={st.week} label="Touched in 7 days" tone="ok" onClick={() => jump("week")} />
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <Panel className="p-5">
              <Eyebrow>Work queue</Eyebrow>
              <div className="mt-1 font-display text-xl">What to do next</div>
              <p className="mt-1 text-sm text-muted">
                Ranked by overdue actions, cold screenings, then quiet referrals.
              </p>
              <div className="mt-4 divide-y divide-line">
                {queue.length ? (
                  queue.map((item) => (
                    <div key={item.key} className="flex items-start justify-between gap-3 py-3">
                      <button
                        type="button"
                        className="min-w-0 text-left"
                        onClick={() => {
                          setOpenItem(item.key);
                          setNav("pipeline");
                        }}
                      >
                        <span className="pill st-screen">{item.tag}</span>
                        <div className="mt-1 truncate text-sm font-medium">{item.title}</div>
                        <div className="text-xs text-muted">{item.why}</div>
                      </button>
                      <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
                        {item.kind === "case" ? (
                          <Button
                            size="sm"
                            onClick={() => {
                              addCaseNote(item.id, "Reached out from the command queue.");
                              toast.success("Touch logged");
                            }}
                          >
                            Log touch
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => {
                            setOpenItem(item.key);
                            setNav("pipeline");
                          }}
                        >
                          Open
                        </Button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="py-8 text-center text-sm text-muted">Nothing waiting. The desk is clear.</p>
                )}
              </div>
            </Panel>

            <Panel className="p-5">
              <Eyebrow>Touch recency</Eyebrow>
              <Donut
                parts={[
                  { label: "This week", n: st.week, color: "var(--color-ok)" },
                  { label: "8–14 days", n: st.mid, color: "var(--color-high)" },
                  {
                    label: "Needs attention",
                    n: Math.max(0, cases.filter((c) => !isClosed(c.status)).length - st.week - st.mid),
                    color: "var(--color-crit)",
                  },
                  { label: "Closed", n: cases.filter((c) => isClosed(c.status)).length, color: "var(--color-muted)" },
                ]}
              />
            </Panel>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel className="p-5">
              <Eyebrow>Referral status</Eyebrow>
              <div className="mt-1 mb-3 text-sm font-medium">
                {cases.length} case{cases.length === 1 ? "" : "s"} · {statuses.length} statuses
              </div>
              <Bars
                entries={statuses}
                color={(e) =>
                  isScreening(e.label)
                    ? "var(--color-accent)"
                    : isClosed(e.label)
                      ? "var(--color-muted)"
                      : "var(--color-navy)"
                }
                max={maxStatus}
                onClick={(e) => jump("status", e.label)}
              />
            </Panel>
            <Panel className="p-5">
              <Eyebrow>Intake owners</Eyebrow>
              <div className="mt-3">
                {people.length ? (
                  <Bars
                    entries={people.map(([label, n]) => ({ label, n }))}
                    color={() => "var(--color-accent)"}
                    max={Math.max(1, ...people.map((p) => p[1]))}
                    onClick={(e) => {
                      setFilters({ intake: e.label, state: ovState === "all" ? "all" : ovState });
                      setNav("pipeline");
                    }}
                  />
                ) : (
                  <p className="text-sm text-muted">No intake owners in this slice.</p>
                )}
              </div>
              <Eyebrow className="mt-6">Referral sources</Eyebrow>
              <div className="mt-3">
                {src.length ? (
                  <Bars
                    entries={src.map(([label, n]) => ({ label, n }))}
                    color={() => "var(--color-navy)"}
                    max={Math.max(1, ...src.map((p) => p[1]))}
                  />
                ) : (
                  <p className="text-sm text-muted">No referral sources tagged.</p>
                )}
              </div>
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}

function Bars({
  entries,
  color,
  max,
  onClick,
}: {
  entries: { label: string; n: number }[];
  color: (e: { label: string; n: number }) => string;
  max: number;
  onClick?: (e: { label: string; n: number }) => void;
}) {
  return (
    <div className="space-y-2">
      {entries.map((e) => {
        const inner = (
          <>
            <div className="truncate text-sm font-medium">{e.label}</div>
            <div className="h-2 overflow-hidden rounded-full bg-line">
              <i
                className="block h-full rounded-full"
                style={{ width: `${Math.max(6, (e.n / max) * 100)}%`, background: color(e) }}
              />
            </div>
            <div className="text-right text-sm font-semibold tabular-nums">{e.n}</div>
          </>
        );
        return onClick ? (
          <button
            key={e.label}
            type="button"
            onClick={() => onClick(e)}
            className="grid w-full grid-cols-[minmax(0,1.2fr)_minmax(80px,1fr)_48px] items-center gap-2.5 py-1 text-left"
          >
            {inner}
          </button>
        ) : (
          <div
            key={e.label}
            className="grid grid-cols-[minmax(0,1.2fr)_minmax(80px,1fr)_48px] items-center gap-2.5 py-1"
          >
            {inner}
          </div>
        );
      })}
    </div>
  );
}

function Donut({
  parts,
}: {
  parts: { label: string; n: number; color: string }[];
}) {
  const total = parts.reduce((s, p) => s + p.n, 0);
  if (!total) return <p className="mt-4 text-sm text-muted">No data yet.</p>;
  const r = 38;
  const circ = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div className="mt-4 flex flex-wrap items-center gap-4">
      <svg viewBox="0 0 100 100" width="118" height="118" aria-hidden="true">
        {parts
          .filter((p) => p.n > 0)
          .map((p) => {
            const frac = p.n / total;
            const dash = frac * circ;
            const rot = acc * 360;
            acc += frac;
            return (
              <circle
                key={p.label}
                cx="50"
                cy="50"
                r={r}
                fill="none"
                stroke={p.color}
                strokeWidth="11"
                strokeDasharray={`${dash} ${circ - dash}`}
                transform={`rotate(${rot - 90} 50 50)`}
              />
            );
          })}
      </svg>
      <div className="min-w-36 flex-1">
        {parts.map((p) => (
          <div key={p.label} className="flex justify-between gap-2 border-b border-line py-1.5 text-sm">
            <span className="truncate">{p.label}</span>
            <span className="tabular-nums">{p.n}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
