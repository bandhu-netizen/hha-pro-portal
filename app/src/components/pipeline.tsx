import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Dropzone } from "@/components/dropzone";
import { Button } from "@/components/ui/button";
import { Eyebrow, Field, Panel, SelectField } from "@/components/ui/field";
import { US } from "@/lib/hha/constants";
import {
  fmtDate,
  fmtTime,
  hydrateCase,
  hydrateTask,
  isClosed,
  isScreening,
  ntypeClass,
  outreachScript,
  recencyClass,
  recencyLabel,
  stateLabel,
  stateSortKey,
  statusChip,
  summarizeCase,
  toLocalInput,
  groupByState,
  workQueue,
} from "@/lib/hha/logic";
import { notifyOS } from "@/lib/hha/notify";
import { toCSV } from "@/lib/hha/logic";
import { useHha } from "@/lib/hha/store";
import type { HydratedCase, HydratedTask, Item } from "@/lib/hha/types";
import { cn } from "@/lib/utils";

function visibleItems(
  items: Item[],
  filters: ReturnType<typeof useHha.getState>["filters"],
  mine: string,
): Item[] {
  const term = filters.q.trim().toLowerCase();
  let rows = items
    .filter((c) =>
      filters.kind === "all"
        ? true
        : filters.kind === "mine"
          ? (c.intake || "").toLowerCase() === mine && !!mine
          : c.kind === filters.kind,
    )
    .filter((c) =>
      filters.status === "all"
        ? true
        : filters.status === "__screen__"
          ? isScreening(c.status)
          : filters.status === "__other__"
            ? !isScreening(c.status) && !isClosed(c.status)
            : (c.status || "") === filters.status,
    )
    .filter((c) => (filters.intake === "all" ? true : c.intake === filters.intake))
    .filter((c) => (filters.state === "all" ? true : (c.state || "GENERAL") === filters.state))
    .filter((c) => {
      if (filters.age === "all") return true;
      if (filters.age === "none") return c.days == null;
      if (filters.age === "7") return c.days != null && c.days <= 7;
      if (filters.age === "14") return c.days != null && c.days > 7 && c.days <= 14;
      return c.days == null || c.days > 14;
    })
    .filter((c) => {
      if (filters.kpi === "stale") return c.days == null || c.days > 14;
      if (filters.kpi === "week") return c.days != null && c.days <= 7;
      if (filters.kpi === "screen") return isScreening(c.status);
      if (filters.kpi && filters.kpi.startsWith("st:")) return c.status === filters.kpi.slice(3);
      return true;
    })
    .filter((c) =>
      !term
        ? true
        : `${c.displayName} ${c.intake || ""} ${c.status || ""} ${(c.notes || []).map((n) => ("text" in n ? n.text : "")).join(" ")}`
            .toLowerCase()
            .includes(term),
    );
  const s = filters.sort;
  rows.sort((a, b) => {
    if (s === "name") return String(a.displayName).localeCompare(String(b.displayName));
    if (s === "notes") return (b.notes || []).length - (a.notes || []).length;
    if (s === "newest") return (b.lastNoteAt || b.updatedAt || 0) - (a.lastNoteAt || a.updatedAt || 0);
    if (s === "due") return ((a as HydratedTask).due || 9e15) - ((b as HydratedTask).due || 9e15);
    return (b.days == null ? 1e9 : b.days) - (a.days == null ? 1e9 : a.days);
  });
  return rows;
}

export function Pipeline() {
  const rawCases = useHha((s) => s.cases);
  const rawTasks = useHha((s) => s.tasks);
  const filters = useHha((s) => s.filters);
  const setFilters = useHha((s) => s.setFilters);
  const name = useHha((s) => s.name);
  const openItem = useHha((s) => s.openItem);
  const setOpenItem = useHha((s) => s.setOpenItem);
  const selected = useHha((s) => s.selected);
  const toggleSelected = useHha((s) => s.toggleSelected);
  const clearSelected = useHha((s) => s.clearSelected);
  const bulkStatus = useHha((s) => s.bulkStatus);
  const bulkDueToday = useHha((s) => s.bulkDueToday);
  const ingestFiles = useHha((s) => s.ingestFiles);
  const clearPipeline = useHha((s) => s.clearPipeline);
  const resetSeed = useHha((s) => s.resetSeed);

  const items = useMemo<Item[]>(
    () => [...Object.values(rawCases).map(hydrateCase), ...Object.values(rawTasks).map(hydrateTask)],
    [rawCases, rawTasks],
  );
  const rows = visibleItems(items, filters, name.trim().toLowerCase());
  const cases = Object.values(rawCases).map(hydrateCase);
  const tasks = Object.values(rawTasks).map(hydrateTask);
  const statuses = [...new Set(items.map((c) => c.status).filter(Boolean))].sort();
  const intakes = [...new Set(items.map((c) => c.intake).filter(Boolean))].sort();
  const states = [...new Set(items.map((c) => c.state || "GENERAL"))].sort((a, b) =>
    stateSortKey(a).localeCompare(stateSortKey(b)),
  );
  const screening = cases.filter((c) => isScreening(c.status)).length;
  const stale = cases.filter((c) => !isClosed(c.status) && (c.days == null || c.days > 14)).length;
  const week = cases.filter((c) => c.days != null && c.days <= 7).length;

  const tiles = [
    { key: "screen", label: "Initial screening", n: screening, tone: "accent" as const },
    { key: "stale", label: "Needs attention", n: stale, tone: "crit" as const },
    { key: "week", label: "Touched ≤ 7 days", n: week, tone: "ok" as const },
  ];

  async function onFiles(files: File[]) {
    const res = await ingestFiles(files);
    if (res.total) toast.success(`${res.total} referrals ingested`);
    res.errors.forEach((e) => toast.error(e));
  }

  function exportCsv() {
    const header = ["Kind", "Case#", "Name", "State", "Status", "Intake", "Last note", "Days old", "Next"];
    const body = rows.map((c) => {
      const sum = c.kind === "case" ? summarizeCase(c) : { next: c.status };
      return [
        c.kind,
        c.kind === "case" ? c.srno : c.ref,
        c.displayName,
        c.state || "",
        c.status || "",
        c.intake || "",
        fmtDate(c.lastNoteAt || (c.kind === "task" ? c.due : null)),
        c.days == null ? "" : c.days,
        sum.next || "",
      ];
    });
    const blob = new Blob([toCSV([header, ...body])], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `pipeline-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  const open = items.find((c) => c.kind + ":" + c.id === openItem) || null;
  const focusQueue = workQueue(cases, tasks, name, 20);
  const focusIdx = Math.max(0, focusQueue.findIndex((q) => q.key === openItem));
  const focusItem = filters.view === "focus" ? items.find((c) => c.kind + ":" + c.id === (openItem || focusQueue[0]?.key)) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-3">
        <Panel className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <Eyebrow>Referrals · ranking · actions</Eyebrow>
              <div className="mt-1 font-display text-xl">One pipeline, split by state</div>
              <p className="mt-1 max-w-xl text-sm text-muted">
                Drop HHA Exchange reports. Cases group by name, notes stack by date, JARVIS ranks the oldest touch first.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => document.getElementById("hha-file")?.click()}>
                Import
              </Button>
              <Button onClick={exportCsv}>Export</Button>
              <Button
                onClick={() => {
                  const cold = cases.filter((c) => !isClosed(c.status) && (c.days == null || c.days > 14));
                  if (!cold.length) return toast("Nothing stale");
                  void notifyOS("Stale referrals", `${cold.length} with no note in 14+ days.`, "stale-digest");
                }}
              >
                Alert stale
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  if (confirm("Erase all pipeline records from this browser?")) clearPipeline();
                }}
              >
                Clear
              </Button>
              <Button onClick={resetSeed}>Reload demo</Button>
            </div>
          </div>
          <div className="mt-3">
            <Dropzone onFiles={onFiles} compact />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {tiles.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setFilters({ kpi: filters.kpi === t.key ? null : t.key, status: "all" })}
                className={cn(
                  "min-w-32 flex-1 rounded-xl border border-line bg-surface px-3 py-3 text-left",
                  filters.kpi === t.key && "border-accent",
                )}
              >
                <div
                  className={cn(
                    "font-display text-2xl tabular-nums",
                    t.tone === "accent" && "text-accent",
                    t.tone === "crit" && "text-crit",
                    t.tone === "ok" && "text-ok",
                  )}
                >
                  {t.n}
                </div>
                <div className="text-xs text-muted">{t.label}</div>
              </button>
            ))}
          </div>
        </Panel>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-9 min-w-48 flex-1 items-center gap-2 rounded-md border border-line bg-surface px-3">
            <Field
              placeholder="Search name, note, intake…"
              className="h-8 border-0 bg-transparent px-0 shadow-none focus:ring-0"
              value={filters.q}
              onChange={(e) => setFilters({ q: e.target.value })}
            />
          </div>
          <SelectField value={filters.status} onChange={(e) => setFilters({ status: e.target.value, kpi: null })}>
            <option value="all">All statuses</option>
            <option value="__screen__">Initial Screening</option>
            <option value="__other__">Other open</option>
            {statuses.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </SelectField>
          <SelectField value={filters.state} onChange={(e) => setFilters({ state: e.target.value })}>
            <option value="all">All states</option>
            {states.map((s) => (
              <option key={s} value={s}>{stateLabel(s)}</option>
            ))}
          </SelectField>
          <SelectField value={filters.intake} onChange={(e) => setFilters({ intake: e.target.value })}>
            <option value="all">All intake</option>
            {intakes.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </SelectField>
          <SelectField value={filters.age} onChange={(e) => setFilters({ age: e.target.value })}>
            <option value="all">Any recency</option>
            <option value="7">0–7 days</option>
            <option value="14">8–14 days</option>
            <option value="15">15+ days</option>
            <option value="none">No note date</option>
          </SelectField>
          <SelectField value={filters.kind} onChange={(e) => setFilters({ kind: e.target.value })}>
            <option value="all">Cases + actions</option>
            <option value="case">Cases only</option>
            <option value="task">Actions only</option>
            <option value="mine">Assigned to me</option>
          </SelectField>
          <SelectField value={filters.sort} onChange={(e) => setFilters({ sort: e.target.value })}>
            <option value="oldest">Oldest first</option>
            <option value="newest">Newest first</option>
            <option value="name">Name A–Z</option>
            <option value="notes">Most notes</option>
            <option value="due">Due date</option>
          </SelectField>
          <div className="flex gap-1">
            {(["rank", "list", "board", "focus"] as const).map((v) => (
              <Button
                key={v}
                size="sm"
                variant={filters.view === v ? "primary" : "secondary"}
                onClick={() => {
                  setFilters({ view: v, sort: v === "rank" || v === "focus" ? "oldest" : filters.sort });
                  if (v === "focus" && focusQueue[0]) setOpenItem(focusQueue[0].key);
                }}
              >
                {v === "rank" ? "Ranked" : v === "list" ? "List" : v === "board" ? "Board" : "Focus"}
              </Button>
            ))}
          </div>
          <span className="ml-auto text-xs text-muted">
            {rows.length} shown · {cases.length} cases · {tasks.filter((t) => t.status !== "Resolved").length} actions
          </span>
        </div>
      </div>

      {filters.view === "focus" && focusItem ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <Drawer item={focusItem} onClose={() => setOpenItem(null)} />
          <Panel className="h-fit p-4">
            <Eyebrow>Queue</Eyebrow>
            <div className="mt-2 space-y-1">
              {focusQueue.map((q, i) => (
                <button
                  key={q.key}
                  type="button"
                  onClick={() => setOpenItem(q.key)}
                  className={cn(
                    "w-full rounded-md px-2 py-2 text-left text-sm",
                    (openItem || focusQueue[0]?.key) === q.key ? "bg-accent-soft" : "hover:bg-surface-2",
                  )}
                >
                  <div className="flex justify-between gap-2">
                    <span className="truncate font-medium">{q.title}</span>
                    <span className="text-[11px] text-muted">{i + 1}</span>
                  </div>
                  <div className="truncate text-xs text-muted">{q.tag}</div>
                </button>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <Button
                className="flex-1"
                disabled={focusIdx <= 0}
                onClick={() => focusQueue[focusIdx - 1] && setOpenItem(focusQueue[focusIdx - 1]!.key)}
              >
                Prev
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                disabled={focusIdx >= focusQueue.length - 1}
                onClick={() => focusQueue[focusIdx + 1] && setOpenItem(focusQueue[focusIdx + 1]!.key)}
              >
                Next
              </Button>
            </div>
          </Panel>
        </div>
      ) : filters.view === "board" ? (
        <Board rows={rows} onOpen={setOpenItem} />
      ) : (
        <div className="mt-3 grid min-h-96 flex-1 overflow-hidden rounded-xl border border-line bg-surface lg:grid-cols-[minmax(280px,36%)_minmax(0,1fr)]">
          <div className="flex min-h-0 flex-col border-b border-line lg:border-b-0 lg:border-r">
            {selected.length ? (
              <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface-2 px-3 py-2">
                <span className="text-xs text-muted">{selected.length} selected</span>
                <SelectField
                  onChange={(e) => {
                    if (e.target.value) bulkStatus(selected, e.target.value);
                  }}
                >
                  <option value="">Set status…</option>
                  {statuses.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </SelectField>
                <Button size="sm" onClick={() => bulkDueToday(selected)}>Due today</Button>
                <Button size="sm" onClick={clearSelected}>Clear</Button>
              </div>
            ) : null}
            <div className="scroll flex-1 overflow-auto">
              {!rows.length ? (
                <p className="px-4 py-16 text-center text-sm text-muted">
                  {items.length ? "Nothing matches." : "Import HHA reports — multiple files split by state."}
                </p>
              ) : (
                groupByState(rows).map(([st, list]) => (
                  <div key={st}>
                    {filters.state === "all" && groupByState(rows).length > 1 ? (
                      <div className="sticky top-0 z-10 flex items-center justify-between bg-surface-2 px-3.5 py-2 text-xs font-semibold">
                        <span>{stateLabel(st)}</span>
                        <span className="text-muted">{list.length}</span>
                      </div>
                    ) : null}
                    {list.map((c) => {
                      const key = c.kind + ":" + c.id;
                      return (
                        <div
                          key={key}
                          role="button"
                          tabIndex={0}
                          onClick={() => setOpenItem(key)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") setOpenItem(key);
                          }}
                          className={cn(
                            "grid grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-2.5 border-b border-line px-3.5 py-2.5",
                            openItem === key && "bg-accent-soft",
                            "hover:bg-accent-soft/50",
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={selected.includes(key)}
                            onClick={(e) => e.stopPropagation()}
                            onChange={() => toggleSelected(key)}
                          />
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">{c.displayName}</div>
                            <div className="truncate text-[11px] text-muted">
                              {c.kind === "task" ? "Action" : c.status || "No source"} · {c.priLabel}
                            </div>
                          </div>
                          <span className="text-xs text-muted tabular-nums">{fmtDate(c.lastNoteAt || (c.kind === "task" ? c.due : null))}</span>
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </div>
          <div className={cn("min-w-0 bg-surface", !open && "hidden lg:block")}>
            {open ? (
              <Drawer item={open} onClose={() => setOpenItem(null)} />
            ) : (
              <div className="grid min-h-80 place-items-center px-8 text-center text-muted">
                <div>
                  <div className="font-display text-lg text-fg">Select a record</div>
                  <p className="mt-1 text-sm">Ranked view already puts the oldest touch at the top.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Board({ rows, onOpen }: { rows: Item[]; onOpen: (k: string) => void }) {
  const groups = new Map<string, Item[]>();
  rows.forEach((c) => {
    const k = isScreening(c.status) ? c.status : c.status || "Unknown";
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(c);
  });
  const ordered = [...groups.entries()].sort(
    (a, b) => (isScreening(a[0]) ? -1 : 0) - (isScreening(b[0]) ? -1 : 0) || b[1].length - a[1].length,
  );
  return (
    <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {ordered.map(([st, items]) => (
        <div key={st} className="min-h-44 rounded-xl border border-line bg-surface">
          <div className="flex justify-between border-b border-line px-3 py-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-faint">{st}</span>
            <span className="text-muted">{items.length}</span>
          </div>
          {items.map((c) => (
            <button
              key={c.kind + c.id}
              type="button"
              onClick={() => onOpen(c.kind + ":" + c.id)}
              className="m-2 w-[calc(100%-16px)] rounded-lg border border-line bg-surface-2 p-3 text-left hover:border-accent"
            >
              <div className="font-medium">{c.displayName}</div>
              <div className="mt-1 text-[11px] text-muted">
                {c.intake || c.state || ""} · {fmtDate(c.lastNoteAt)}
              </div>
              <div className="mt-2">
                <span className={cn("pill", c.priClass)}>{c.priLabel}</span>
              </div>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

function Drawer({ item, onClose }: { item: Item; onClose: () => void }) {
  if (item.kind === "task") return <TaskDrawer t={item} onClose={onClose} />;
  return <CaseDrawer c={item} onClose={onClose} />;
}

function CaseDrawer({ c, onClose }: { c: HydratedCase; onClose: () => void }) {
  const name = useHha((s) => s.name);
  const updateCase = useHha((s) => s.updateCase);
  const addCaseNote = useHha((s) => s.addCaseNote);
  const deleteCase = useHha((s) => s.deleteCase);
  const [note, setNote] = useState("");
  const [full, setFull] = useState(false);
  const sum = summarizeCase(c);
  const script = outreachScript(c, name);
  const types = Object.entries(sum.types)
    .map(([k, n]) => `${n} ${k.toLowerCase()}`)
    .join(" · ");

  return (
    <div className="scroll h-full overflow-y-auto">
      <div className="flex items-start justify-between gap-3 border-b border-line p-6">
        <div>
          <Eyebrow>
            {stateLabel(c.state)} · {c.srno || "—"}
          </Eyebrow>
          <div className="mt-1 font-display text-2xl">{c.name}</div>
          <div className="mt-1 text-sm text-muted">
            {c.intake || "No intake"} · {c.source || "No source"}
            {c.ids?.length ? ` · ${c.ids.join(", ")}` : ""}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className={cn("pill", recencyClass(sum.days))}>{recencyLabel(sum.days)}</span>
            <span className={cn("pill", statusChip(c.status))}>{c.status || "No status"}</span>
          </div>
        </div>
        <Button size="icon" onClick={onClose} aria-label="Close">
          ×
        </Button>
      </div>
      <div className="border-b border-line p-6">
        <div className="rounded-lg bg-surface-2 p-3.5">
          <Eyebrow>Note rollup</Eyebrow>
          <div className="mt-1 mb-2 text-sm font-medium">{sum.headline}</div>
          <ul className="space-y-1 text-sm text-muted">
            {sum.bullets.map((b) => (
              <li key={b}>· {b}</li>
            ))}
          </ul>
          <div className="mt-2 text-sm font-medium text-accent">Next: {sum.next}</div>
        </div>
        <div className="mt-3 rounded-lg border border-line p-3">
          <Eyebrow>JARVIS script</Eyebrow>
          <p className="mt-1 text-sm leading-relaxed">{script}</p>
          <Button
            size="sm"
            className="mt-2"
            onClick={() => {
              void navigator.clipboard.writeText(script);
              toast.success("Script copied");
            }}
          >
            Copy script
          </Button>
        </div>
      </div>
      <div className="border-b border-line p-6">
        <Eyebrow className="mb-2">Assignment</Eyebrow>
        <div className="flex flex-wrap gap-2">
          <SelectField value={c.state || "GENERAL"} onChange={(e) => updateCase(c.id, { state: e.target.value })}>
            <option value="GENERAL">Unmapped</option>
            {Object.keys(US).map((s) => (
              <option key={s} value={s}>
                {s} · {US[s]}
              </option>
            ))}
          </SelectField>
          <Field
            value={c.intake}
            placeholder="Intake"
            className="w-40"
            onChange={(e) => updateCase(c.id, { intake: e.target.value })}
          />
          <Field
            value={c.status}
            placeholder="Status"
            className="w-44"
            onChange={(e) => updateCase(c.id, { status: e.target.value })}
          />
        </div>
      </div>
      <div className="border-b border-line p-6">
        <Eyebrow className="mb-2">Log a note</Eyebrow>
        <div className="flex gap-2">
          <Field
            className="flex-1"
            placeholder="Call, text, or update…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                addCaseNote(c.id, note);
                setNote("");
              }
            }}
          />
          <Button
            variant="primary"
            onClick={() => {
              addCaseNote(c.id, note);
              setNote("");
            }}
          >
            Log
          </Button>
        </div>
      </div>
      <div className="border-b border-line p-6">
        <div className="mb-2 flex justify-between">
          <Eyebrow>
            Timeline ({c.notes.length}
            {types ? ` · ${types}` : ""})
          </Eyebrow>
          <Button size="sm" onClick={() => setFull(!full)}>
            {full ? "Collapse" : "Expand"}
          </Button>
        </div>
        {full ? (
          [...c.notes].reverse().map((n) => (
            <div key={n.id} className="border-t border-line py-3">
              <div className="flex items-center gap-2">
                <span className={cn("ntype pill", ntypeClass(n.type))}>{n.type}</span>
                <span className="text-[11px] text-muted">
                  {fmtTime(n.at)} · {n.author}
                </span>
              </div>
              <div className="mt-1 whitespace-pre-wrap text-sm">{n.text}</div>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted">Latest is in the rollup. Expand for the full thread.</p>
        )}
      </div>
      <div className="flex flex-wrap gap-2 p-6">
        <Button
          onClick={() => {
            void navigator.clipboard.writeText(`${c.name}\n${sum.next}\n${sum.headline}`);
            toast.success("Summary copied");
          }}
        >
          Copy summary
        </Button>
        <Button onClick={() => void notifyOS(c.name, sum.next, "case-" + c.id, "case:" + c.id)}>Notify now</Button>
        <Button
          variant="danger"
          onClick={() => {
            if (confirm("Remove this referral?")) deleteCase(c.id);
          }}
        >
          Remove
        </Button>
      </div>
    </div>
  );
}

function TaskDrawer({ t, onClose }: { t: HydratedTask; onClose: () => void }) {
  const updateTask = useHha((s) => s.updateTask);
  const addTaskNote = useHha((s) => s.addTaskNote);
  const deleteTask = useHha((s) => s.deleteTask);
  const [note, setNote] = useState("");
  return (
    <div className="scroll h-full overflow-y-auto">
      <div className="flex items-start justify-between gap-3 border-b border-line p-6">
        <div>
          <Eyebrow>{stateLabel(t.state)} · Action</Eyebrow>
          <div className="mt-1 font-display text-2xl">{t.title}</div>
          <div className="mt-1 text-sm text-muted">
            {t.patient || "No patient"} · {fmtTime(t.createdAt)}
          </div>
        </div>
        <Button size="icon" onClick={onClose}>×</Button>
      </div>
      <div className="border-b border-line p-6">
        <Eyebrow className="mb-2">Status</Eyebrow>
        <div className="flex flex-wrap gap-1.5">
          {["Open", "In progress", "Waiting on agency", "Resolved"].map((s) => (
            <Button key={s} size="sm" variant={t.status === s ? "primary" : "secondary"} onClick={() => updateTask(t.id, { status: s })}>
              {s}
            </Button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 border-b border-line p-6">
        <Field value={t.assignee} placeholder="Assignee" className="w-40" onChange={(e) => updateTask(t.id, { assignee: e.target.value })} />
        <Field value={t.patient} placeholder="Patient" className="w-40" onChange={(e) => updateTask(t.id, { patient: e.target.value })} />
        <Field
          type="datetime-local"
          className="w-52 font-mono text-xs"
          value={toLocalInput(t.due)}
          onChange={(e) => updateTask(t.id, { due: e.target.value ? new Date(e.target.value).getTime() : null })}
        />
      </div>
      <div className="border-b border-line p-6">
        <div className="mb-3 flex gap-2">
          <Field
            className="flex-1"
            placeholder="What happened?"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                addTaskNote(t.id, note);
                setNote("");
              }
            }}
          />
          <Button
            variant="primary"
            onClick={() => {
              addTaskNote(t.id, note);
              setNote("");
            }}
          >
            Log
          </Button>
        </div>
        {[...t.notes].reverse().map((n) => (
          <div key={n.id} className="border-t border-line py-3">
            <div className="text-[11px] text-muted">
              {fmtTime(n.at)} · {n.byName}
            </div>
            <div className="mt-1 text-sm">{n.text}</div>
          </div>
        ))}
      </div>
      <div className="p-6">
        <Button variant="danger" onClick={() => deleteTask(t.id)}>Delete</Button>
      </div>
    </div>
  );
}
