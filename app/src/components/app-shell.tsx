import { useEffect, useState } from "react";
import { Bell, LayoutGrid, Menu, Network, Search, Settings2, Users } from "lucide-react";
import { Toaster, toast } from "sonner";
import { Alerts } from "@/components/alerts";
import { Compose } from "@/components/compose";
import { Gate } from "@/components/gate";
import { JarvisDock } from "@/components/jarvis-dock";
import { Network as NetworkView } from "@/components/network";
import { Overview } from "@/components/overview";
import { Palette } from "@/components/palette";
import { Pipeline } from "@/components/pipeline";
import { Settings } from "@/components/settings";
import { Button } from "@/components/ui/button";
import { NAV, type NavId } from "@/lib/hha/constants";
import {
  greeting,
  hydrateCase,
  hydrateTask,
  initialsOf,
  isClosed,
  isScreening,
  localBriefing,
  pipelineStats,
  workQueue,
} from "@/lib/hha/logic";
import { notifyOS, registerSW, syncAlarms } from "@/lib/hha/notify";
import { useHha } from "@/lib/hha/store";
import { cn } from "@/lib/utils";

const ICONS: Record<NavId, typeof LayoutGrid> = {
  overview: LayoutGrid,
  pipeline: Users,
  alerts: Bell,
  network: Network,
  settings: Settings2,
};

function applyTheme(theme: "system" | "light" | "dark") {
  const dark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

export function AppShell() {
  const hydrated = useHha((s) => s.hydrated);
  const setHydrated = useHha((s) => s.setHydrated);
  const nav = useHha((s) => s.nav);
  const setNav = useHha((s) => s.setNav);
  const name = useHha((s) => s.name);
  const theme = useHha((s) => s.theme);
  const compact = useHha((s) => s.compact);
  const ingestFiles = useHha((s) => s.ingestFiles);
  const cases = useHha((s) => s.cases);
  const tasks = useHha((s) => s.tasks);
  const reminders = useHha((s) => s.reminders);
  const nprefs = useHha((s) => s.nprefs);
  const markFired = useHha((s) => s.markFired);
  const logAlert = useHha((s) => s.logAlert);
  const patchReminder = useHha((s) => s.patchReminder);
  const pushJarvis = useHha((s) => s.pushJarvis);
  const setJarvisOpen = useHha((s) => s.setJarvisOpen);
  const jarvis = useHha((s) => s.jarvis);
  const setOpenItem = useHha((s) => s.setOpenItem);
  const openItem = useHha((s) => s.openItem);

  const [menu, setMenu] = useState(false);
  const [palette, setPalette] = useState(false);
  const [compose, setCompose] = useState(false);

  useEffect(() => {
    const result = useHha.persist.rehydrate();
    if (result && typeof result.then === "function") {
      void result.then(() => setHydrated());
    } else {
      setHydrated();
    }
  }, [setHydrated]);

  useEffect(() => {
    if (!hydrated) return;
    applyTheme(theme);
  }, [theme, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    void registerSW((item) => setOpenItem(item));
  }, [hydrated, setOpenItem]);

  useEffect(() => {
    if (!hydrated) return;
    const alarms = Object.values(reminders)
      .filter((r) => r.status !== "done" && r.at)
      .map((r) => ({
        id: "rem:" + r.id,
        title: r.title,
        body: r.body || "Reminder",
        tag: "rem:" + r.id,
        fireAt: r.at,
        repeat: r.repeat,
        data: { item: r.itemKey || null },
      }));
    void syncAlarms(alarms);
  }, [reminders, hydrated]);

  useEffect(() => {
    if (!hydrated || !name) return;
    const hc = Object.values(cases).map(hydrateCase);
    const ht = Object.values(tasks).map(hydrateTask);
    const st = pipelineStats(hc, ht);
    const now = Date.now();
    if (nprefs.due) {
      ht.filter((t) => t.status !== "Resolved" && t.due && t.due <= now).forEach((t) => {
        const tag = "due:" + t.id;
        if (markFired(tag)) {
          logAlert("Due now", t.title, tag, "task:" + t.id);
          void notifyOS("Due now", t.title, tag, "task:" + t.id);
        }
      });
    }
    if (nprefs.stale) {
      hc.filter((c) => !isClosed(c.status) && c.days === 15).forEach((c) => {
        const tag = "stale15:" + c.id;
        if (markFired(tag)) {
          logAlert("Stale referral", c.name, tag, "case:" + c.id);
          void notifyOS("Stale referral", c.name + " has had no note for 15 days.", tag, "case:" + c.id);
        }
      });
    }
    if (nprefs.brief) {
      const [hh, mm] = String(nprefs.briefTime || "08:30").split(":").map(Number);
      const d = new Date();
      const tag = "brief:" + d.toISOString().slice(0, 10);
      if (d.getHours() === hh && d.getMinutes() >= mm! && d.getMinutes() < mm! + 3 && markFired(tag)) {
        const body = `${st.screening} in Initial Screening · ${st.stale} stale · ${st.overdue} due`;
        logAlert("Morning briefing", body, tag);
        void notifyOS("Morning briefing", body, tag);
      }
    }
    Object.values(reminders).forEach((r) => {
      if (!r || r.status === "done" || !r.at || r.at > now) return;
      const tag = "rem:" + r.id + ":" + Math.floor(r.at / 60000);
      if (markFired(tag)) {
        logAlert(r.title, r.body, tag, r.itemKey);
        void notifyOS(r.title, r.body || "Reminder", tag, r.itemKey);
        if (r.repeat === "daily") patchReminder(r.id, { at: now + 86400000 });
        if (r.repeat === "weekly") patchReminder(r.id, { at: now + 7 * 86400000 });
      }
    });
  }, [hydrated, name, cases, tasks, reminders, nprefs, markFired, logAlert, patchReminder]);

  useEffect(() => {
    if (!hydrated || !name || jarvis.length) return;
    const hc = Object.values(cases).map(hydrateCase);
    const ht = Object.values(tasks).map(hydrateTask);
    const q = workQueue(hc, ht, name, 6);
    pushJarvis({ role: "jarvis", text: localBriefing(name, hc, ht, q) });
  }, [hydrated, name, cases, tasks, jarvis.length, pushJarvis]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      if (meta && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette(true);
      }
      if (meta && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setJarvisOpen(true);
      }
      if (meta && e.key.toLowerCase() === "n") {
        e.preventDefault();
        setCompose(true);
      }
      if (meta && ["1", "2", "3", "4", "5"].includes(e.key)) {
        e.preventDefault();
        setNav(NAV[+e.key - 1]!.id);
      }
      if (!typing && e.key === "/") {
        e.preventDefault();
        setPalette(true);
      }
      if (e.key === "Escape") {
        setPalette(false);
        setCompose(false);
        setMenu(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setNav, setJarvisOpen]);

  const hc = Object.values(cases).map(hydrateCase);
  const ht = Object.values(tasks).map(hydrateTask);
  const st = pipelineStats(hc, ht);
  const alertCount =
    st.overdue +
    st.stale +
    Object.values(reminders).filter((r) => r.status !== "done" && r.at && r.at <= Date.now()).length;
  const current = NAV.find((n) => n.id === nav)!;

  return (
    <div className={cn("relative z-[1] min-h-dvh bg-bg text-fg", compact ? "lg:grid-cols-[76px_1fr]" : "lg:grid-cols-[232px_1fr]", "grid grid-cols-1")}>
      <Toaster theme={theme === "light" ? "light" : "dark"} position="bottom-right" />
      <Gate />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 flex w-[260px] flex-col border-r border-white/10 bg-sidebar text-sidebar-fg transition-transform duration-200 lg:sticky lg:top-0 lg:h-dvh lg:w-auto lg:translate-x-0",
          menu ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        <div className="flex items-center gap-2.5 px-4 pb-4 pt-5">
          <div className="grid size-9 place-items-center rounded-md bg-accent font-display text-lg text-accent-fg">H</div>
          {!compact ? (
            <div className="leading-tight">
              <strong className="block font-display text-sm">HHA Pro</strong>
              <span className="text-[11px] text-sidebar-muted">Cottage Homecare</span>
            </div>
          ) : null}
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 px-2">
          {!compact ? (
            <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-muted">
              Workspace
            </div>
          ) : null}
          {NAV.map((n) => {
            const Icon = ICONS[n.id];
            const count = n.id === "pipeline" ? st.attention : n.id === "alerts" ? alertCount : 0;
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => {
                  setNav(n.id);
                  setMenu(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-md px-3 py-2.5 text-left text-sm font-medium text-sidebar-fg/85 hover:bg-white/5",
                  nav === n.id && "bg-white/8 font-semibold text-sidebar-fg",
                  compact && "justify-center px-0",
                )}
              >
                <Icon className="size-[18px] shrink-0" strokeWidth={1.7} />
                {!compact ? <span>{n.label}</span> : null}
                {!compact && count ? (
                  <span className="ml-auto grid min-w-5 place-items-center rounded-full bg-accent px-1.5 text-[11px] font-semibold text-accent-fg">
                    {count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>
        <div className="mt-auto border-t border-white/10 px-3 py-3 text-xs text-sidebar-muted">
          <div className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-ok shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-ok)_30%,transparent)]" />
            {!compact ? <span>Saved locally</span> : null}
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-bg/80 px-4 py-3 backdrop-blur-md md:px-5">
          <button
            type="button"
            className="grid size-9 place-items-center rounded-md border border-line bg-surface lg:hidden"
            onClick={() => setMenu(!menu)}
            aria-label="Menu"
          >
            <Menu className="size-4" />
          </button>
          <div>
            <div className="text-xs font-medium text-muted">{current.kicker}</div>
            <div className="font-display text-xl leading-tight">{current.label}</div>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setPalette(true)}
              className="hidden h-9 items-center gap-2 rounded-md border border-line bg-surface px-3 text-sm text-muted sm:flex"
            >
              <Search className="size-3.5" />
              Search
              <kbd className="rounded border border-line bg-surface-2 px-1.5 text-[10px] font-semibold">⌘K</kbd>
            </button>
            <div className="flex max-w-[42vw] items-center gap-2 rounded-full border border-line bg-surface py-0.5 pl-0.5 pr-2.5">
              <div className="grid size-7 place-items-center rounded-full bg-accent font-display text-[11px] font-semibold text-accent-fg">
                {initialsOf(name || "H")}
              </div>
              <div className="min-w-0 leading-tight">
                <div className="truncate font-display text-sm">{name || "Guest"}</div>
                <div className="hidden text-[10px] text-muted sm:block">Cottage Homecare</div>
              </div>
            </div>
            <Button variant="primary" onClick={() => setCompose(true)}>
              Log action
            </Button>
          </div>
        </header>
        <main className="relative flex min-h-0 flex-1 flex-col p-4 pb-24 md:p-6 md:pb-24">
          {!hydrated ? (
            <p className="text-sm text-muted">{greeting("")}. Restoring the desk…</p>
          ) : nav === "overview" ? (
            <Overview />
          ) : nav === "pipeline" ? (
            <Pipeline />
          ) : nav === "alerts" ? (
            <Alerts />
          ) : nav === "network" ? (
            <NetworkView />
          ) : (
            <Settings />
          )}
        </main>
      </div>

      {menu ? (
        <button type="button" className="fixed inset-0 z-20 bg-black/40 lg:hidden" onClick={() => setMenu(false)} />
      ) : null}

      <JarvisDock />
      <Palette open={palette} onClose={() => setPalette(false)} />
      <Compose open={compose} onClose={() => setCompose(false)} />
      <input
        id="hha-file"
        type="file"
        accept=".csv,.tsv,.txt,.xlsx,.xls"
        multiple
        className="hidden"
        onChange={(e) => {
          void ingestFiles(Array.from(e.target.files || [])).then((res) => {
            if (res.total) toast.success(`${res.total} referrals ingested`);
            res.errors.forEach((err) => toast.error(err));
            if (res.total) setNav("pipeline");
          });
          e.target.value = "";
        }}
      />
      {openItem ? null : null}
    </div>
  );
}
