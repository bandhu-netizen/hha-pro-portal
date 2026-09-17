import { create } from "zustand";
import { persist } from "zustand/middleware";
import { KEYS, NET_AUTH, NET_API, NET_KEY, type NavId } from "./constants";
import {
  classifyNote,
  extractCaseIds,
  hydrateCase,
  hydrateTask,
  inferState,
  uid,
} from "./logic";
import { fileToTable, looksLikeCrm, rowsToCases, rowsToTasks } from "./parse";
import { seedCases, seedNetwork, seedReminders, seedTasks } from "./seed";
import type {
  AlertLogItem,
  JarvisMessage,
  NetworkRecord,
  NotifyPrefs,
  PipeFilters,
  PipelineTask,
  ReferralCase,
  Reminder,
  ThemeMode,
} from "./types";

export type HhaState = {
  hydrated: boolean;
  name: string;
  theme: ThemeMode;
  compact: boolean;
  nav: NavId;
  ovState: string;
  openItem: string | null;
  selected: string[];
  cases: Record<string, ReferralCase>;
  tasks: Record<string, PipelineTask>;
  reminders: Record<string, Reminder>;
  alertLog: AlertLogItem[];
  fired: string[];
  nprefs: NotifyPrefs;
  netAuth: boolean;
  network: NetworkRecord[];
  netSource: "live" | "local" | "idle";
  filters: PipeFilters;
  jarvis: JarvisMessage[];
  jarvisOpen: boolean;
  seeded: boolean;
  setHydrated: () => void;
  setName: (name: string) => void;
  setTheme: (theme: ThemeMode) => void;
  setCompact: (v: boolean) => void;
  setNav: (nav: NavId) => void;
  setOvState: (s: string) => void;
  setOpenItem: (key: string | null) => void;
  setFilters: (p: Partial<PipeFilters>) => void;
  toggleSelected: (key: string) => void;
  clearSelected: () => void;
  mergeCases: (incoming: ReferralCase[]) => { added: number; notes: number; updated: number };
  addTask: (task: Omit<PipelineTask, "id" | "createdAt" | "updatedAt" | "notes"> & { notes?: PipelineTask["notes"] }) => string;
  updateCase: (id: string, patch: Partial<ReferralCase>) => void;
  updateTask: (id: string, patch: Partial<PipelineTask>) => void;
  addCaseNote: (id: string, text: string) => void;
  addTaskNote: (id: string, text: string) => void;
  deleteCase: (id: string) => void;
  deleteTask: (id: string) => void;
  bulkStatus: (keys: string[], status: string) => void;
  bulkDueToday: (keys: string[]) => void;
  clearPipeline: () => void;
  addReminder: (r: Omit<Reminder, "id" | "createdAt" | "status">) => string;
  patchReminder: (id: string, patch: Partial<Reminder>) => void;
  deleteReminder: (id: string) => void;
  logAlert: (title: string, body: string, tag?: string, itemKey?: string) => void;
  clearAlertLog: () => void;
  markFired: (tag: string) => boolean;
  setNprefs: (p: Partial<NotifyPrefs>) => void;
  setNetAuth: (v: boolean) => void;
  setNetwork: (rows: NetworkRecord[], source: "live" | "local") => void;
  upsertNetwork: (row: NetworkRecord) => void;
  removeNetwork: (id: string) => void;
  pushJarvis: (msg: Omit<JarvisMessage, "id" | "at">) => void;
  setJarvisOpen: (v: boolean) => void;
  ingestFiles: (files: File[]) => Promise<{ total: number; screens: number; errors: string[] }>;
  resetSeed: () => void;
};

const defaultFilters: PipeFilters = {
  q: "",
  status: "all",
  state: "all",
  intake: "all",
  age: "all",
  kind: "all",
  sort: "oldest",
  kpi: null,
  view: "rank",
};

const defaultPrefs: NotifyPrefs = {
  due: true,
  stale: true,
  brief: true,
  briefTime: "08:30",
  voice: true,
};

function boot() {
  const cases = seedCases();
  const tasks = seedTasks();
  return {
    name: "",
    theme: "dark" as ThemeMode,
    compact: false,
    nav: "overview" as NavId,
    ovState: "all",
    openItem: null as string | null,
    selected: [] as string[],
    cases,
    tasks,
    reminders: seedReminders(""),
    alertLog: [] as AlertLogItem[],
    fired: [] as string[],
    nprefs: defaultPrefs,
    netAuth: false,
    network: seedNetwork(),
    netSource: "local" as const,
    filters: defaultFilters,
    jarvis: [] as JarvisMessage[],
    jarvisOpen: false,
    seeded: true,
  };
}

export const useHha = create<HhaState>()(
  persist(
    (set, get) => ({
      hydrated: false,
      ...boot(),
      setHydrated: () => set({ hydrated: true }),
      setName: (name) => set({ name }),
      setTheme: (theme) => set({ theme }),
      setCompact: (compact) => set({ compact }),
      setNav: (nav) => set({ nav, jarvisOpen: nav === "overview" ? get().jarvisOpen : get().jarvisOpen }),
      setOvState: (ovState) => set({ ovState }),
      setOpenItem: (openItem) => set({ openItem, nav: openItem ? "pipeline" : get().nav }),
      setFilters: (p) => set({ filters: { ...get().filters, ...p } }),
      toggleSelected: (key) =>
        set((s) => ({
          selected: s.selected.includes(key)
            ? s.selected.filter((k) => k !== key)
            : [...s.selected, key],
        })),
      clearSelected: () => set({ selected: [] }),
      mergeCases: (incoming) => {
        let added = 0;
        let notes = 0;
        let updated = 0;
        const db = { ...get().cases };
        incoming.forEach((c) => {
          const prev = db[c.id];
          if (!prev) {
            db[c.id] = c;
            added += 1;
            notes += c.notes.length;
            return;
          }
          const have = new Set((prev.notes || []).map((n) => `${n.at || ""}|${n.author}|${n.text}`));
          let extra = 0;
          const merged = { ...prev, notes: [...(prev.notes || [])] };
          c.notes.forEach((n) => {
            const sig = `${n.at || ""}|${n.author}|${n.text}`;
            if (!have.has(sig)) {
              merged.notes.push(n);
              extra += 1;
            }
          });
          merged.notes.sort((a, b) => (a.at || 0) - (b.at || 0));
          merged.status = c.status || merged.status;
          merged.intake = c.intake || merged.intake;
          merged.manager = c.manager || merged.manager;
          merged.source = c.source || merged.source;
          merged.branch = c.branch || merged.branch;
          merged.reason = c.reason || merged.reason;
          const blob = `${merged.branch} ` + merged.notes.map((n) => n.text).join(" ");
          merged.state =
            inferState(merged.branch, merged.stateRaw || merged.state, "") ||
            c.state ||
            merged.state ||
            "GENERAL";
          merged.ids = extractCaseIds(blob);
          const last = merged.notes[merged.notes.length - 1];
          merged.lastNoteAt = last ? last.at : merged.lastNoteAt;
          merged.updatedAt = Date.now();
          db[c.id] = merged;
          notes += extra;
          if (extra) updated += 1;
        });
        set({ cases: db });
        return { added, notes, updated };
      },
      addTask: (task) => {
        const id = uid();
        const row: PipelineTask = {
          notes: [],
          ...task,
          id,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        set((s) => ({ tasks: { ...s.tasks, [id]: row } }));
        return id;
      },
      updateCase: (id, patch) =>
        set((s) => {
          const prev = s.cases[id];
          if (!prev) return s;
          return { cases: { ...s.cases, [id]: { ...prev, ...patch, updatedAt: Date.now() } } };
        }),
      updateTask: (id, patch) =>
        set((s) => {
          const prev = s.tasks[id];
          if (!prev) return s;
          return { tasks: { ...s.tasks, [id]: { ...prev, ...patch, updatedAt: Date.now() } } };
        }),
      addCaseNote: (id, text) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        set((s) => {
          const prev = s.cases[id];
          if (!prev) return s;
          const type = classifyNote(trimmed);
          const notes = [
            ...prev.notes,
            {
              id: uid(),
              at: Date.now(),
              author: s.name || "anonymous",
              type,
              text: trimmed,
            },
          ];
          return {
            cases: {
              ...s.cases,
              [id]: { ...prev, notes, lastNoteAt: Date.now(), updatedAt: Date.now() },
            },
          };
        });
      },
      addTaskNote: (id, text) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        set((s) => {
          const prev = s.tasks[id];
          if (!prev) return s;
          return {
            tasks: {
              ...s.tasks,
              [id]: {
                ...prev,
                notes: [
                  ...prev.notes,
                  { id: uid(), text: trimmed, at: Date.now(), byName: s.name || "anonymous" },
                ],
                updatedAt: Date.now(),
              },
            },
          };
        });
      },
      deleteCase: (id) =>
        set((s) => {
          const next = { ...s.cases };
          delete next[id];
          return { cases: next, openItem: s.openItem === "case:" + id ? null : s.openItem };
        }),
      deleteTask: (id) =>
        set((s) => {
          const next = { ...s.tasks };
          delete next[id];
          return { tasks: next, openItem: s.openItem === "task:" + id ? null : s.openItem };
        }),
      bulkStatus: (keys, status) =>
        set((s) => {
          const cases = { ...s.cases };
          const tasks = { ...s.tasks };
          keys.forEach((key) => {
            const [kind, ...rest] = key.split(":");
            const id = rest.join(":");
            if (kind === "case" && cases[id]) cases[id] = { ...cases[id]!, status, updatedAt: Date.now() };
            if (kind === "task" && tasks[id]) tasks[id] = { ...tasks[id]!, status, updatedAt: Date.now() };
          });
          return { cases, tasks };
        }),
      bulkDueToday: (keys) => {
        const due = Date.now();
        set((s) => {
          const cases = { ...s.cases };
          const tasks = { ...s.tasks };
          keys.forEach((key) => {
            const [kind, ...rest] = key.split(":");
            const id = rest.join(":");
            if (kind === "case" && cases[id]) cases[id] = { ...cases[id]!, due, updatedAt: Date.now() };
            if (kind === "task" && tasks[id]) tasks[id] = { ...tasks[id]!, due, updatedAt: Date.now() };
          });
          return { cases, tasks };
        });
      },
      clearPipeline: () => set({ cases: {}, tasks: {}, openItem: null, selected: [], seeded: false }),
      addReminder: (r) => {
        const id = uid();
        set((s) => ({
          reminders: {
            ...s.reminders,
            [id]: { ...r, id, status: "open", createdAt: Date.now() },
          },
        }));
        return id;
      },
      patchReminder: (id, patch) =>
        set((s) => {
          const prev = s.reminders[id];
          if (!prev) return s;
          return { reminders: { ...s.reminders, [id]: { ...prev, ...patch } } };
        }),
      deleteReminder: (id) =>
        set((s) => {
          const next = { ...s.reminders };
          delete next[id];
          return { reminders: next };
        }),
      logAlert: (title, body, tag = "", itemKey = "") =>
        set((s) => ({
          alertLog: [
            { id: uid(), title, body, tag, itemKey, at: Date.now() },
            ...s.alertLog,
          ].slice(0, 60),
        })),
      clearAlertLog: () => set({ alertLog: [] }),
      markFired: (tag) => {
        if (get().fired.includes(tag)) return false;
        set((s) => ({ fired: [...s.fired, tag].slice(-400) }));
        return true;
      },
      setNprefs: (p) => set((s) => ({ nprefs: { ...s.nprefs, ...p } })),
      setNetAuth: (netAuth) => set({ netAuth }),
      setNetwork: (network, netSource) => set({ network, netSource }),
      upsertNetwork: (row) =>
        set((s) => {
          const i = s.network.findIndex((n) => n._id === row._id);
          const network = [...s.network];
          if (i >= 0) network[i] = row;
          else network.push(row);
          return { network };
        }),
      removeNetwork: (id) =>
        set((s) => ({ network: s.network.filter((n) => n._id !== id) })),
      pushJarvis: (msg) =>
        set((s) => ({
          jarvis: [...s.jarvis, { ...msg, id: uid(), at: Date.now() }].slice(-40),
        })),
      setJarvisOpen: (jarvisOpen) => set({ jarvisOpen }),
      ingestFiles: async (files) => {
        const operator = get().name;
        let total = 0;
        let screens = 0;
        const errors: string[] = [];
        for (const file of files) {
          try {
            const table = await fileToTable(file);
            if (looksLikeCrm(table.headers)) {
              const cases = rowsToCases(table.headers, table.rows, {
                file: file.name,
                defaultState: table.defaultState,
              });
              if (!cases.length) {
                errors.push(file.name + ": no referral rows");
                continue;
              }
              get().mergeCases(cases);
              total += cases.length;
              screens += cases.filter((c) => /initial\s*screen/i.test(c.status)).length;
            } else {
              const tasks = rowsToTasks(table.headers, table.rows, file.name, operator);
              if (!tasks.length) {
                errors.push(file.name + ": could not map columns");
                continue;
              }
              set((s) => {
                const next = { ...s.tasks };
                tasks.forEach((t) => {
                  next[t.id] = t;
                });
                return { tasks: next };
              });
            }
          } catch (e) {
            errors.push(file.name + ": " + (e instanceof Error ? e.message : "failed"));
          }
        }
        return { total, screens, errors };
      },
      resetSeed: () =>
        set({
          cases: seedCases(),
          tasks: seedTasks(),
          reminders: seedReminders(get().name),
          seeded: true,
          openItem: null,
          selected: [],
        }),
    }),
    {
      name: KEYS.store,
      skipHydration: true,
      partialize: (s) => ({
        name: s.name,
        theme: s.theme,
        compact: s.compact,
        nav: s.nav,
        ovState: s.ovState,
        cases: s.cases,
        tasks: s.tasks,
        reminders: s.reminders,
        alertLog: s.alertLog,
        fired: s.fired,
        nprefs: s.nprefs,
        netAuth: s.netAuth,
        network: s.network,
        netSource: s.netSource,
        seeded: s.seeded,
        jarvis: s.jarvis.slice(-12),
      }),
    },
  ),
);

export function useDesk() {
  const cases = useHha((s) => s.cases);
  const tasks = useHha((s) => s.tasks);
  const hydratedCases = Object.values(cases).map(hydrateCase);
  const hydratedTasks = Object.values(tasks).map(hydrateTask);
  return { cases: hydratedCases, tasks: hydratedTasks };
}

export async function tryLiveNetwork(): Promise<NetworkRecord[] | null> {
  try {
    const res = await fetch(NET_API, {
      headers: { "X-API-Key": NET_KEY },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

export function checkNetLogin(email: string, pass: string) {
  return email.trim() === NET_AUTH.user && pass === NET_AUTH.pass;
}
