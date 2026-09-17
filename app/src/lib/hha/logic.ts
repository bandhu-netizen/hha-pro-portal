import {
  CLOSED_RX,
  HOLD_RX,
  MD_HINT,
  NAME_TO_CODE,
  SCREEN_RX,
  US,
} from "./constants";
import type {
  CaseNote,
  HydratedCase,
  HydratedTask,
  Item,
  NoteType,
  PipelineTask,
  ReferralCase,
} from "./types";

export const uid = () =>
  "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export function today0() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function daysOut(ms: number) {
  return Math.round((new Date(ms).setHours(0, 0, 0, 0) - today0()) / 86400000);
}

export function daysOldOf(ms: number | null | undefined) {
  if (!ms) return null;
  return Math.floor((today0() - new Date(ms).setHours(0, 0, 0, 0)) / 86400000);
}

export function fmtDate(ms: number | null | undefined) {
  return ms
    ? new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : "—";
}

export function fmtTime(ms: number | null | undefined) {
  return ms
    ? new Date(ms).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "—";
}

export function toLocalInput(ms: number | null | undefined) {
  if (!ms) return "";
  const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
}

export function clipText(s: string, n: number) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length <= n ? t : t.slice(0, n).trim() + "…";
}

export function isScreening(s: string | undefined) {
  return SCREEN_RX.test(s || "");
}
export function isClosed(s: string | undefined) {
  return CLOSED_RX.test(s || "");
}

export function greeting(name: string) {
  const h = new Date().getHours();
  const part = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  const first = name.trim().split(" ")[0];
  return first ? `${part}, ${first}` : part;
}

export function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || "sir";
}

export function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "H";
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase();
}

export function resolveState(raw: string | undefined | null) {
  if (!raw) return null;
  const up = String(raw).trim().toUpperCase();
  if (US[up]) return up;
  return NAME_TO_CODE[String(raw).trim().toLowerCase()] || null;
}

export function stateFromText(text = "", allowCodes = false) {
  const lower = text.toLowerCase();
  for (const [name, code] of Object.entries(NAME_TO_CODE)) {
    if (lower.includes(name)) return code;
  }
  if (!allowCodes) return null;
  for (const chunk of text.toUpperCase().match(/(?:^|[^A-Z])([A-Z]{2})(?:[^A-Z]|$)/g) || []) {
    const code = chunk.replace(/[^A-Z]/g, "");
    if (US[code]) return code;
  }
  return null;
}

export function inferState(branch: string, state: string, blob: string) {
  const fromState = resolveState(state) || resolveState(branch);
  if (fromState) return fromState;
  const fromShort = stateFromText(`${branch || ""} ${state || ""}`, true);
  if (fromShort) return fromShort;
  const fromName = stateFromText(blob || "");
  if (fromName) return fromName;
  if (MD_HINT.test(blob || "")) return "MD";
  return null;
}

export function stateLabel(code: string | undefined) {
  if (!code || code === "GENERAL") return "Unmapped";
  return US[code] || code;
}

export function stateSortKey(code: string) {
  if (!code || code === "GENERAL") return "zzz";
  return US[code] || code;
}

export function groupByState<T extends { state?: string }>(rows: T[]) {
  const map = new Map<string, T[]>();
  rows.forEach((c) => {
    const k = c.state || "GENERAL";
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(c);
  });
  return [...map.entries()].sort((a, b) =>
    stateSortKey(a[0]).localeCompare(stateSortKey(b[0])),
  );
}

export function classifyNote(text: string): NoteType {
  const t = String(text || "");
  if (/as per |new pt|new patient|_rs:/i.test(t)) return "Intake";
  const fail =
    /no ans|no answer|no response|left a vm|left vm|voice mail|voicemail|\bvm\b|left a text|unreachable|not going thru|hung up|mailbox is full|vm full/i.test(
      t,
    );
  const spoke =
    /spoke with|spoke wiht|connected with|connected him|connected her|member replied|informed that/i.test(
      t,
    );
  if (fail && !spoke) return "Outreach";
  if (spoke) return "Conversation";
  if (/schedul|appointment|aers|level 1|lvl 1|screening is/i.test(t)) return "Scheduling";
  if (/\b(ssn|ssal|medicaid|passport|mortgage|bank statement|document list|drivers license)\b/i.test(t))
    return "Documents";
  return "Note";
}

export function extractCaseIds(text: string) {
  return [...new Set(String(text || "").match(/CHC[-\s]?\d{5,}/gi) || [])].map((s) =>
    s.replace(/\s+/g, "").toUpperCase(),
  );
}

export function caseKey(name: string, srno: string) {
  return String(name || "").trim().toUpperCase().replace(/\s+/g, " ") + "||" + String(srno || "").trim();
}

export function recencyLabel(days: number | null) {
  if (days == null || Number.isNaN(days)) return "Needs attention";
  if (days <= 7) return "This week";
  if (days <= 14) return "More than a week";
  return "Needs attention";
}

export function recencyClass(days: number | null) {
  if (days == null || Number.isNaN(days) || days > 14) return "tier-over";
  if (days <= 7) return "tier-week";
  return "tier-mid";
}

export function statusChip(s: string | undefined) {
  if (isScreening(s)) return "st-screen";
  if (isClosed(s)) return "st-closed";
  if (HOLD_RX.test(s || "")) return "st-hold";
  return "st-open";
}

export function ntypeClass(t: string) {
  return (
    (
      {
        Outreach: "nt-outreach",
        Conversation: "nt-conversation",
        Scheduling: "nt-scheduling",
        Documents: "nt-documents",
        Intake: "nt-intake",
      } as Record<string, string>
    )[t] || "nt-note"
  );
}

export function nextAction(
  c: { status?: string },
  last: CaseNote | null,
  days: number | null,
  outreach: number,
) {
  if (!last) return "Log first contact.";
  if (isScreening(c.status) && (days == null || days >= 3))
    return "Initial screening — call or text today.";
  if (last.type === "Outreach" && outreach >= 2)
    return "Try another number or text — last calls missed.";
  if ((days || 0) >= 14) return "Overdue follow-up — no note in 14+ days.";
  if ((days || 0) >= 7) return "Weekly check-in is due.";
  if (/wait|hold|waitlist|insufficient staff/i.test(last.text))
    return "Hold reminder — recheck county / AERS.";
  if (last.type === "Scheduling") return "Send a reminder before the screening.";
  if (last.type === "Documents") return "Confirm documents posted.";
  return "Continue weekly touch until the next pipeline move.";
}

export function summarizeCase(c: ReferralCase | HydratedCase) {
  const notes = (c.notes || []).slice().sort((a, b) => (a.at || 0) - (b.at || 0));
  if (!notes.length)
    return {
      headline: "No notes imported.",
      bullets: [] as string[],
      last: null as CaseNote | null,
      days: null as number | null,
      types: {} as Record<string, number>,
      next: "Log first contact.",
    };
  const last = notes[notes.length - 1]!;
  const days = daysOldOf(last.at);
  const types: Record<string, number> = {};
  notes.forEach((n) => {
    types[n.type] = (types[n.type] || 0) + 1;
  });
  const recent = notes.slice(-8);
  const outreach = recent.filter((n) => n.type === "Outreach").length;
  const bullets = [
    `Last ${last.type.toLowerCase()} on ${fmtTime(last.at)} by ${last.author || "unknown"}.`,
  ];
  if (outreach >= 3)
    bullets.push(`${outreach} of the last ${recent.length} notes are unanswered outreach.`);
  const spoke = [...notes].reverse().find((n) => n.type === "Conversation");
  if (spoke && spoke.id !== last.id)
    bullets.push(`Last live conversation: ${fmtDate(spoke.at)} — ${clipText(spoke.text, 140)}`);
  if (c.status)
    bullets.push("Pipeline status: " + c.status + (c.reason ? ` (${c.reason})` : "") + ".");
  const ids = extractCaseIds(notes.map((n) => n.text).join(" "));
  if (ids.length) bullets.push("Linked IDs: " + ids.join(", ") + ".");
  return {
    headline: clipText(last.text, 220),
    bullets,
    last,
    days,
    types,
    next: nextAction(c, last, days, outreach),
  };
}

export function hydrateCase(c: ReferralCase): HydratedCase {
  const notes = (c.notes || []).slice().sort((a, b) => (a.at || 0) - (b.at || 0));
  const last = notes[notes.length - 1] || null;
  const days = last ? daysOldOf(last.at) : c.lastNoteAt ? daysOldOf(c.lastNoteAt) : null;
  return {
    ...c,
    kind: "case",
    notes,
    last,
    days,
    priLabel: recencyLabel(days),
    priClass: recencyClass(days),
    displayName: c.name,
  };
}

export function hydrateTask(raw: PipelineTask): HydratedTask {
  const notes = (raw.notes || []).slice().sort((a, b) => a.at - b.at);
  const days = raw.due
    ? -daysOut(raw.due)
    : notes.length
      ? daysOldOf(notes[notes.length - 1]!.at)
      : null;
  const overdue = !!(raw.due && raw.status !== "Resolved" && raw.due <= Date.now());
  return {
    ...raw,
    kind: "task",
    notes,
    days,
    displayName: raw.title,
    status: raw.status || "Open",
    lastNoteAt: notes.length ? notes[notes.length - 1]!.at : raw.updatedAt,
    intake: raw.assignee || "",
    priLabel: overdue ? "Overdue" : recencyLabel(days),
    priClass: overdue ? "tier-over" : recencyClass(days),
  };
}

export function outreachScript(c: HydratedCase, operator: string) {
  const who = operator.split(" ")[0] || "Cottage Homecare";
  const days = c.days;
  if (isScreening(c.status)) {
    return `Hi, this is ${who} with Cottage Homecare calling about ${c.name}'s initial screening. We still need to complete it — is now a good time, or should I text a couple of slots?`;
  }
  if (c.last?.type === "Outreach") {
    return `Hi, ${who} again from Cottage Homecare for ${c.name}. I left a message earlier — just circling back on the referral. Call or text me when you have a minute.`;
  }
  if ((days || 0) >= 14) {
    return `Hi, this is ${who} with Cottage Homecare. Checking in on ${c.name} — we haven't connected in a couple of weeks and I want to make sure nothing is stalled.`;
  }
  return `Hi, this is ${who} with Cottage Homecare regarding ${c.name}. Calling with a quick update on the referral — do you have two minutes?`;
}

export type WorkItem = {
  key: string;
  title: string;
  why: string;
  urgency: number;
  kind: Item["kind"];
  id: string;
  tag: string;
  script?: string;
};

export function workQueue(
  cases: HydratedCase[],
  tasks: HydratedTask[],
  operator: string,
  limit = 6,
): WorkItem[] {
  const now = Date.now();
  const items: WorkItem[] = [];

  tasks
    .filter((t) => t.status !== "Resolved" && t.due && t.due <= now)
    .forEach((t) =>
      items.push({
        key: "task:" + t.id,
        title: t.title,
        why: `Due ${fmtTime(t.due)}` + (t.patient ? ` · ${t.patient}` : ""),
        urgency: 0,
        kind: "task",
        id: t.id,
        tag: "Due action",
      }),
    );

  cases
    .filter((c) => !isClosed(c.status) && isScreening(c.status) && (c.days == null || c.days >= 3))
    .forEach((c) =>
      items.push({
        key: "case:" + c.id,
        title: c.name,
        why: nextAction(c, c.last, c.days, c.notes.filter((n) => n.type === "Outreach").length),
        urgency: 1 + Math.min(c.days || 0, 20) / 20,
        kind: "case",
        id: c.id,
        tag: "Screening",
        script: outreachScript(c, operator),
      }),
    );

  cases
    .filter((c) => !isClosed(c.status) && !isScreening(c.status) && (c.days == null || c.days > 14))
    .forEach((c) =>
      items.push({
        key: "case:" + c.id,
        title: c.name,
        why: `${c.status || "Open"} · ${recencyLabel(c.days)}`,
        urgency: 2 + Math.min(c.days || 0, 30) / 30,
        kind: "case",
        id: c.id,
        tag: "Stale",
        script: outreachScript(c, operator),
      }),
    );

  tasks
    .filter((t) => t.status !== "Resolved" && (!t.due || t.due > now))
    .forEach((t) =>
      items.push({
        key: "task:" + t.id,
        title: t.title,
        why: t.due ? `Due ${fmtDate(t.due)}` : t.assignee || "Open action",
        urgency: 4,
        kind: "task",
        id: t.id,
        tag: "Action",
      }),
    );

  items.sort((a, b) => a.urgency - b.urgency);
  const seen = new Set<string>();
  return items.filter((i) => {
    if (seen.has(i.key)) return false;
    seen.add(i.key);
    return true;
  }).slice(0, limit);
}

export function pipelineStats(cases: HydratedCase[], tasks: HydratedTask[]) {
  const statuses: Record<string, number> = {};
  cases.forEach((c) => {
    const k = c.status || "Unknown";
    statuses[k] = (statuses[k] || 0) + 1;
  });
  const screening = cases.filter((c) => isScreening(c.status)).length;
  const otherOpen = cases.filter((c) => !isScreening(c.status) && !isClosed(c.status)).length;
  const closed = cases.filter((c) => isClosed(c.status)).length;
  const stale = cases.filter((c) => !isClosed(c.status) && (c.days == null || c.days > 14)).length;
  const week = cases.filter((c) => c.days != null && c.days <= 7).length;
  const mid = cases.filter((c) => c.days != null && c.days > 7 && c.days <= 14).length;
  const overdue = tasks.filter((t) => t.status !== "Resolved" && t.due && t.due <= Date.now()).length;
  const openTasks = tasks.filter((t) => t.status !== "Resolved").length;
  const attention = screening + stale + overdue;
  return {
    statuses,
    screening,
    otherOpen,
    closed,
    stale,
    week,
    mid,
    overdue,
    openTasks,
    attention,
    total: cases.length,
  };
}

export function localBriefing(
  name: string,
  cases: HydratedCase[],
  tasks: HydratedTask[],
  queue: WorkItem[],
) {
  const st = pipelineStats(cases, tasks);
  const who = firstName(name);
  const lines: string[] = [];
  lines.push(`${greeting(name)}. Systems online.`);
  if (!st.total && !st.openTasks) {
    lines.push("The pipeline is empty. Drop an HHA Exchange report and I'll rank the desk.");
    return lines.join(" ");
  }
  const bits = [
    st.screening ? `${st.screening} in initial screening` : null,
    st.stale ? `${st.stale} gone cold past two weeks` : null,
    st.overdue ? `${st.overdue} action${st.overdue === 1 ? "" : "s"} past due` : null,
  ].filter(Boolean);
  if (bits.length) lines.push(`${who}, ${bits.join(", ")}.`);
  else lines.push("No fires. The desk is holding.");
  if (queue[0]) {
    lines.push(`First up: ${queue[0].title}. ${queue[0].why}`);
  }
  return lines.join(" ");
}

export function normKey(s: string) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function mapHeaders(headers: string[], aliases: Record<string, string[]>) {
  const map: Record<string, number> = {};
  headers.forEach((h, i) => {
    const n = normKey(h);
    for (const [canon, list] of Object.entries(aliases)) {
      if (map[canon] !== undefined) continue;
      if (list.some((a) => n === a || (a.length >= 4 && n.includes(a)))) {
        map[canon] = i;
        break;
      }
    }
  });
  return map;
}

export function parseLooseDate(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.getTime();
  const s = String(v).trim();
  const m = s.match(
    /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/,
  );
  if (m) {
    const y = m[3]!.length === 2 ? "20" + m[3] : m[3];
    const d = new Date(
      +y!,
      +m[1]! - 1,
      +m[2]!,
      m[4] !== undefined ? +m[4] : 17,
      m[5] !== undefined ? +m[5] : 0,
      m[6] !== undefined ? +m[6] : 0,
    );
    if (!Number.isNaN(d.getTime())) return d.getTime();
  }
  const d2 = new Date(s);
  return Number.isNaN(d2.getTime()) ? null : d2.getTime();
}

export function parseCSV(text: string) {
  const delim = text.includes("\t") && !text.includes(",") ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) {
      row.push(cur);
      cur = "";
    } else if (c === "\n") {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
    } else if (c !== "\r") cur += c;
  }
  if (cur !== "" || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => String(v).trim() !== ""));
}

export function toCSV(rows: (string | number)[][]) {
  return rows
    .map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\r\n");
}
