import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Eyebrow, Field, Kpi, Panel, SelectField } from "@/components/ui/field";
import {
  fmtTime,
  hydrateCase,
  hydrateTask,
  isClosed,
  isScreening,
  recencyLabel,
  toLocalInput,
} from "@/lib/hha/logic";
import { enableNotifications, notifyAllowed, notifyOS, scheduleTest } from "@/lib/hha/notify";
import { useHha } from "@/lib/hha/store";
import { cn } from "@/lib/utils";

function defaultWhen() {
  const d = new Date(Date.now() + 3600000);
  d.setMinutes(0, 0, 0);
  return toLocalInput(d.getTime());
}

export function Alerts() {
  const cases = useHha((s) => Object.values(s.cases).map(hydrateCase));
  const tasks = useHha((s) => Object.values(s.tasks).map(hydrateTask));
  const reminders = useHha((s) => Object.values(s.reminders).filter((r) => r.status !== "done"));
  const log = useHha((s) => s.alertLog);
  const nprefs = useHha((s) => s.nprefs);
  const setNprefs = useHha((s) => s.setNprefs);
  const addReminder = useHha((s) => s.addReminder);
  const patchReminder = useHha((s) => s.patchReminder);
  const deleteReminder = useHha((s) => s.deleteReminder);
  const clearAlertLog = useHha((s) => s.clearAlertLog);
  const setOpenItem = useHha((s) => s.setOpenItem);
  const name = useHha((s) => s.name);
  const items = useMemo(
    () => [...cases, ...tasks].slice(0, 80),
    [cases, tasks],
  );

  const now = Date.now();
  const overdue = tasks.filter((t) => t.status !== "Resolved" && t.due && t.due <= now);
  const stale = cases.filter((c) => !isClosed(c.status) && (c.days == null || c.days > 14));
  const screenLate = cases.filter((c) => isScreening(c.status) && (c.days == null || c.days >= 3));
  const dueRems = reminders.filter((r) => r.at && r.at <= now);
  const upcoming = reminders.filter((r) => !r.at || r.at > now);

  const [title, setTitle] = useState("");
  const [when, setWhen] = useState(defaultWhen);
  const [repeat, setRepeat] = useState<"once" | "daily" | "weekly">("once");
  const [link, setLink] = useState("");
  const [body, setBody] = useState("");
  const [perm, setPerm] = useState(typeof window !== "undefined" && notifyAllowed());

  const queue = [
    ...overdue.map((t) => ({
      kind: "Due",
      title: t.title,
      meta: (t.assignee || t.state || "Action") + " · " + fmtTime(t.due),
      key: "task:" + t.id,
      cls: "tier-over",
    })),
    ...dueRems.map((r) => ({
      kind: "Reminder",
      title: r.title,
      meta: fmtTime(r.at) + (r.repeat !== "once" ? " · " + r.repeat : ""),
      key: r.itemKey || "",
      cls: "tier-mid",
    })),
    ...screenLate.slice(0, 8).map((c) => ({
      kind: "Screening",
      title: c.name,
      meta: recencyLabel(c.days) + " · " + (c.intake || "unassigned"),
      key: "case:" + c.id,
      cls: "st-screen",
    })),
    ...stale
      .filter((c) => !isScreening(c.status))
      .slice(0, 8)
      .map((c) => ({
        kind: "Stale",
        title: c.name,
        meta: (c.status || "") + " · " + recencyLabel(c.days),
        key: "case:" + c.id,
        cls: "tier-over",
      })),
  ].slice(0, 16);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-3xl font-medium tracking-tight">Alarms & reminders</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Due work, stale screenings, and anything you schedule — an alarm pops in the computer’s notification bar, even if this window is in the background.
        </p>
      </div>

      <Panel className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-start gap-3">
          <span className={cn("mt-1.5 size-1.5 rounded-full", perm ? "bg-ok" : "bg-high")} />
          <div>
            <div className="text-sm font-semibold">{perm ? "Computer notifications on" : "Desktop alarms are off"}</div>
            <div className="text-xs text-muted">
              {perm
                ? "Reminders fire in the desktop notification center. Keep the browser open."
                : "Allow notifications so reminders push into this computer’s notification bar."}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            onClick={async () => {
              const ok = await enableNotifications();
              setPerm(ok);
            }}
          >
            {perm ? "Desktop alarms on" : "Enable desktop alarms"}
          </Button>
          <Button onClick={() => void notifyOS("JARVIS test", "If you can read this, the path is live.", "test")}>
            Send test
          </Button>
          <Button onClick={() => void scheduleTest()}>Alarm in 8s</Button>
        </div>
      </Panel>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 stagger-in">
        <Kpi n={overdue.length} label="Due actions" tone="crit" />
        <Kpi n={stale.length} label="Stale 14+ days" tone="high" />
        <Kpi n={screenLate.length} label="Screening 3+ days" tone="accent" />
        <Kpi n={dueRems.length + upcoming.length} label="Open reminders" tone="ok" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.9fr)]">
        <Panel className="p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <Eyebrow>Needs a ping</Eyebrow>
            <Button
              size="sm"
              onClick={() => {
                if (!stale.length) return toast("Nothing stale");
                void notifyOS("Stale referrals", `${stale.length} with no note in 14+ days.`, "stale-digest");
              }}
            >
              Alert all stale
            </Button>
          </div>
          {queue.length ? (
            queue.map((x) => (
              <div key={x.kind + x.title} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2.5 border-b border-line py-3">
                <button type="button" className="min-w-0 text-left" onClick={() => x.key && setOpenItem(x.key)}>
                  <span className={cn("pill", x.cls)}>{x.kind}</span>
                  <div className="mt-0.5 truncate text-sm font-medium">{x.title}</div>
                  <div className="text-xs text-muted">{x.meta}</div>
                </button>
                <Button size="sm" onClick={() => void notifyOS(x.title, x.kind, "ping-" + x.title, x.key)}>
                  Ping
                </Button>
              </div>
            ))
          ) : (
            <p className="py-8 text-center text-sm text-muted">Nothing waiting. Set a reminder or import a report.</p>
          )}
        </Panel>

        <Panel className="p-5">
          <Eyebrow>Set a reminder</Eyebrow>
          <div className="mt-1 mb-3 font-display text-lg">When should this fire?</div>
          <div className="flex flex-col gap-2">
            <Field placeholder="Title — call back, screening, docs…" value={title} onChange={(e) => setTitle(e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <Field type="datetime-local" className="font-mono text-xs" value={when} onChange={(e) => setWhen(e.target.value)} />
              <SelectField value={repeat} onChange={(e) => setRepeat(e.target.value as typeof repeat)}>
                <option value="once">Once</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </SelectField>
            </div>
            <SelectField value={link} onChange={(e) => setLink(e.target.value)}>
              <option value="">No linked record</option>
              {items.map((c) => (
                <option key={c.kind + c.id} value={c.kind + ":" + c.id}>
                  {(c.kind === "task" ? "Action" : "Referral") + " · " + c.displayName}
                </option>
              ))}
            </SelectField>
            <Field placeholder="Optional note" value={body} onChange={(e) => setBody(e.target.value)} />
            <Button
              variant="primary"
              onClick={() => {
                if (!title.trim()) return toast.error("Needs a title");
                const at = new Date(when).getTime();
                if (Number.isNaN(at)) return toast.error("Invalid time");
                addReminder({ title: title.trim(), body: body.trim(), at, repeat, itemKey: link, createdBy: name });
                toast.success("Reminder set");
                setTitle("");
                setBody("");
                setWhen(defaultWhen());
                if (!notifyAllowed()) void enableNotifications();
              }}
            >
              Set reminder
            </Button>
          </div>
          <Eyebrow className="mt-5 mb-2">Upcoming</Eyebrow>
          {dueRems.length + upcoming.length ? (
            [...dueRems, ...upcoming].map((r) => (
              <div key={r.id} className="border-b border-line py-3">
                <button type="button" className="w-full text-left" onClick={() => r.itemKey && setOpenItem(r.itemKey)}>
                  <div className="truncate text-sm font-medium">{r.title}</div>
                  <div className="text-xs text-muted">
                    {r.at && r.at <= now ? "Due · " : ""}
                    {fmtTime(r.at)}
                    {r.repeat !== "once" ? " · " + r.repeat : ""}
                  </div>
                </button>
                <div className="mt-2 flex flex-wrap gap-1">
                  <Button size="sm" onClick={() => patchReminder(r.id, { at: Math.max(r.at, Date.now()) + 3600000 })}>
                    +1h
                  </Button>
                  <Button size="sm" onClick={() => patchReminder(r.id, { at: Math.max(r.at, Date.now()) + 86400000 })}>
                    +1d
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      if (r.repeat === "daily") patchReminder(r.id, { at: Date.now() + 86400000 });
                      else if (r.repeat === "weekly") patchReminder(r.id, { at: Date.now() + 7 * 86400000 });
                      else patchReminder(r.id, { status: "done" });
                    }}
                  >
                    Done
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => deleteReminder(r.id)}>
                    Remove
                  </Button>
                </div>
              </div>
            ))
          ) : (
            <p className="py-6 text-center text-sm text-muted">No reminders yet.</p>
          )}
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="p-5">
          <Eyebrow>Auto-alert rules</Eyebrow>
          <p className="mb-2 mt-1 text-sm text-muted">These fire as desktop alarms without you watching the tab.</p>
          <label className="flex items-start gap-3 border-b border-line py-3.5">
            <input type="checkbox" checked={nprefs.due} onChange={(e) => setNprefs({ due: e.target.checked })} className="mt-1" />
            <div>
              <div className="text-sm font-medium">Due actions</div>
              <div className="text-xs text-muted">Pipeline actions whose due time has passed.</div>
            </div>
          </label>
          <label className="flex items-start gap-3 border-b border-line py-3.5">
            <input type="checkbox" checked={nprefs.stale} onChange={(e) => setNprefs({ stale: e.target.checked })} className="mt-1" />
            <div>
              <div className="text-sm font-medium">Stale referrals (14+ days)</div>
              <div className="text-xs text-muted">Open cases with no note for two weeks. Fires once at day 15.</div>
            </div>
          </label>
          <label className="flex items-start gap-3 py-3.5">
            <input type="checkbox" checked={nprefs.brief} onChange={(e) => setNprefs({ brief: e.target.checked })} className="mt-1" />
            <div className="flex-1">
              <div className="text-sm font-medium">Morning briefing</div>
              <div className="mb-2 text-xs text-muted">One digest of screening, stale, and due counts.</div>
              <Field
                type="time"
                className="w-32 font-mono text-xs"
                value={nprefs.briefTime}
                onChange={(e) => setNprefs({ briefTime: e.target.value })}
              />
            </div>
          </label>
          <label className="flex items-start gap-3 border-t border-line py-3.5">
            <input type="checkbox" checked={nprefs.voice} onChange={(e) => setNprefs({ voice: e.target.checked })} className="mt-1" />
            <div>
              <div className="text-sm font-medium">JARVIS voice</div>
              <div className="text-xs text-muted">Speak briefings and next-up prompts.</div>
            </div>
          </label>
        </Panel>
        <Panel className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <Eyebrow>Recent alerts</Eyebrow>
            <Button size="sm" onClick={clearAlertLog}>Clear log</Button>
          </div>
          {log.length ? (
            log.slice(0, 14).map((x) => (
              <button
                key={x.id}
                type="button"
                className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-2 border-b border-line py-3 text-left"
                onClick={() => x.itemKey && setOpenItem(x.itemKey)}
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{x.title}</div>
                  <div className="text-xs text-muted">
                    {fmtTime(x.at)}
                    {x.body ? " · " + x.body : ""}
                  </div>
                </div>
              </button>
            ))
          ) : (
            <p className="py-6 text-center text-sm text-muted">No alerts fired yet.</p>
          )}
        </Panel>
      </div>
    </div>
  );
}
