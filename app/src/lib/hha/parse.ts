import { CRM_ALIASES, TASK_ALIASES } from "./constants";
import {
  caseKey,
  classifyNote,
  extractCaseIds,
  inferState,
  mapHeaders,
  parseCSV,
  parseLooseDate,
  stateFromText,
  uid,
} from "./logic";
import type { PipelineTask, ReferralCase } from "./types";

export type Table = {
  headers: string[];
  rows: string[][];
  file?: string;
  defaultState?: string | null;
};

function colIndex(header: string[], names: string[]) {
  return header.findIndex((h) =>
    names.some((n) => {
      const k = String(h || "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
      return k === n || (n.length > 3 && k.includes(n));
    }),
  );
}

function isHhaNested(rows: string[][]) {
  const hasName = (rows || []).some((r) =>
    (r || []).some((c) => /referral\s*name/i.test(String(c))),
  );
  const hasNote = (rows || []).some((r) =>
    (r || []).some((c) => /^note\s*date$/i.test(String(c).trim())),
  );
  return hasName && hasNote;
}

function flattenHhaDetail(rows: string[][]): Table {
  const hi = rows.findIndex((r) => (r || []).some((c) => /referral\s*name/i.test(String(c))));
  const head = (rows[Math.max(0, hi)] || []).map((h) => String(h ?? "").trim());
  const iSr = colIndex(head, ["srno", "sr"]);
  const iName = colIndex(head, ["referralname", "name"]);
  const iBranch = colIndex(head, ["branch"]);
  const iRecv = colIndex(head, ["receiveddate", "received"]);
  const iIntake = colIndex(head, ["intakeperson", "intake"]);
  const iMgr = colIndex(head, ["accountmanager"]);
  const iSrc = colIndex(head, ["referralsource"]);
  const iContact = colIndex(head, ["referralsourcecontact"]);
  const iSub = colIndex(head, ["submittedto"]);
  const iStatus = colIndex(head, ["referralstatus", "status"]);
  const iReason = colIndex(head, ["referralreason"]);
  let noteCols = { date: 1, author: 4, note: 7 };
  for (let i = Math.max(0, hi) + 1; i < Math.min(rows.length, hi + 12); i++) {
    const r = rows[i] || [];
    const d = r.findIndex((c) => /^note\s*date$/i.test(String(c).trim()));
    if (d >= 0) {
      const a = r.findIndex((c) => /^author$/i.test(String(c).trim()));
      const n = r.findIndex((c) => /^note$/i.test(String(c).trim()));
      noteCols = { date: d, author: a >= 0 ? a : 4, note: n >= 0 ? n : 7 };
      break;
    }
  }
  const pick = (r: string[], i: number) =>
    i == null || i < 0 ? "" : String(r[i] ?? "").trim();
  const isCaseRow = (r: string[]) => {
    const a = pick(r, iSr >= 0 ? iSr : 0);
    const name = pick(r, iName >= 0 ? iName : 1);
    return /^\d+$/.test(a) && name && !/^note\s*date$/i.test(name);
  };
  const headers = [
    "SrNo",
    "ReferralName",
    "Branch",
    "ReceivedDate",
    "IntakePerson",
    "AccountManager",
    "ReferralSource",
    "ReferralSourceContact",
    "SubmittedTo",
    "ReferralStatus",
    "ReferralReason",
    "NoteDate",
    "Author",
    "Note",
  ];
  const out: string[][] = [];
  let cur: string[] | null = null;
  rows.slice(Math.max(0, hi) + 1).forEach((raw) => {
    const r = raw || [];
    if (r.some((c) => /^note\s*date$/i.test(String(c).trim())) && !isCaseRow(r)) return;
    if (isCaseRow(r)) {
      cur = [
        pick(r, iSr),
        pick(r, iName),
        pick(r, iBranch),
        pick(r, iRecv),
        pick(r, iIntake),
        pick(r, iMgr),
        pick(r, iSrc),
        pick(r, iContact),
        pick(r, iSub),
        pick(r, iStatus),
        pick(r, iReason),
      ];
      out.push([...cur, "", "", ""]);
      return;
    }
    if (!cur) return;
    const nd = pick(r, noteCols.date);
    const author = pick(r, noteCols.author);
    const note = pick(r, noteCols.note);
    if (!nd && !note) return;
    out.push([...cur, nd, author, note]);
  });
  if (!out.length) throw new Error("Could not read nested referral notes.");
  return { headers, rows: out };
}

function normalizeTable(rows: string[][], fileName: string): Table {
  const hi = Math.max(
    0,
    rows.findIndex((r) => (r || []).some((c) => /referral\s*name/i.test(String(c)))),
  );
  const headers = (rows[hi] || []).map((h) => String(h ?? ""));
  const body = rows
    .slice(hi + 1)
    .filter((r) => (r || []).some((v) => String(v ?? "").trim() !== ""));
  if (headers.length < 2 || body.length < 1)
    throw new Error((fileName || "File") + " needs a header and a row.");
  return { headers, rows: body, file: fileName };
}

function workbookToTable(
  wb: { SheetNames: string[]; Sheets: Record<string, unknown> },
  fileName: string,
  XLSX: typeof import("xlsx"),
): Table {
  const blobs = [fileName];
  wb.SheetNames.forEach((name) => {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name] as import("xlsx").WorkSheet, {
      header: 1,
      raw: false,
      defval: "",
    }) as unknown[][];
    blobs.push(name, rows.flat().slice(0, 80).join(" "));
  });
  const defaultState = inferState("", "", blobs.join(" ")) || stateFromText(fileName);
  let best: string[][] | null = null;
  let bestScore = -1;
  wb.SheetNames.forEach((name) => {
    const rows = (
      XLSX.utils.sheet_to_json(wb.Sheets[name] as import("xlsx").WorkSheet, {
        header: 1,
        raw: false,
        defval: "",
      }) as unknown[][]
    ).map((r) => (r || []).map((c) => (c == null ? "" : String(c))));
    const hasName = rows.some((r) => r.some((c) => /referral\s*name/i.test(String(c))));
    if (!hasName) return;
    const score = (/detail/i.test(name) ? 10000 : 0) + rows.length;
    if (score > bestScore) {
      bestScore = score;
      best = rows;
    }
  });
  if (!best) {
    const sheet = wb.Sheets[wb.SheetNames[0]!];
    const rows = (
      XLSX.utils.sheet_to_json(sheet as import("xlsx").WorkSheet, {
        header: 1,
        raw: false,
        defval: "",
      }) as unknown[][]
    ).map((r) => (r || []).map((c) => (c == null ? "" : String(c))));
    if (rows.length < 2) throw new Error("Spreadsheet is empty.");
    const table = normalizeTable(rows, fileName);
    table.defaultState = defaultState;
    return table;
  }
  const table = isHhaNested(best) ? flattenHhaDetail(best) : normalizeTable(best, fileName);
  table.defaultState = defaultState;
  table.file = fileName;
  return table;
}

export async function fileToTable(file: File): Promise<Table> {
  const name = (file.name || "").toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const XLSX = await import("xlsx");
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array", cellDates: true });
    return workbookToTable(wb, file.name, XLSX);
  }
  const text = await file.text();
  const parsed = parseCSV(text);
  if (parsed.length < 2) throw new Error("File needs a header and a row.");
  const table = normalizeTable(parsed, file.name);
  table.defaultState =
    inferState("", "", file.name + " " + parsed[0]!.join(" ")) || stateFromText(file.name);
  return table;
}

export function looksLikeCrm(headers: string[]) {
  const m = mapHeaders(headers, CRM_ALIASES);
  return m.name !== undefined && (m.note !== undefined || m.status !== undefined);
}

export function rowsToCases(
  headers: string[],
  rows: string[][],
  meta: { file?: string; defaultState?: string | null } = {},
): ReferralCase[] {
  const hm = mapHeaders(headers, CRM_ALIASES);
  if (hm.name === undefined) throw new Error("No name / referral column found.");
  const pick = (r: string[], k: string) =>
    hm[k] === undefined ? "" : String(r[hm[k]!] ?? "").trim();
  const grouped = new Map<string, ReferralCase>();
  rows.forEach((r, idx) => {
    const name = pick(r, "name");
    if (!name) return;
    const srno = pick(r, "srno");
    const key = caseKey(name, srno);
    const noteText = pick(r, "note");
    const author = pick(r, "author");
    const noteType = (pick(r, "notetype") || classifyNote(noteText)) as ReferralCase["notes"][0]["type"];
    const at = parseLooseDate(pick(r, "notedate")) || parseLooseDate(pick(r, "received"));
    const rec =
      grouped.get(key) ||
      ({
        id: key,
        srno,
        name,
        branch: pick(r, "branch"),
        stateRaw: pick(r, "state"),
        state: "GENERAL",
        received: parseLooseDate(pick(r, "received")),
        intake: pick(r, "intake"),
        manager: pick(r, "manager"),
        source: pick(r, "source"),
        sourceContact: pick(r, "sourcecontact"),
        submittedTo: pick(r, "submitted"),
        status: pick(r, "status") || "Open",
        reason: pick(r, "reason"),
        notes: [],
        ids: [],
        lastNoteAt: null,
        sourceFile: meta.file || "",
        updatedAt: Date.now(),
      } satisfies ReferralCase);
    if (pick(r, "status")) rec.status = pick(r, "status");
    if (pick(r, "intake")) rec.intake = pick(r, "intake");
    if (pick(r, "branch")) rec.branch = pick(r, "branch");
    if (noteText) {
      const sig = `${at || ""}|${author}|${noteText}`;
      if (!rec.notes.some((n) => `${n.at || ""}|${n.author}|${n.text}` === sig)) {
        rec.notes.push({
          id: uid() + idx,
          at,
          author,
          type: noteType,
          text: noteText,
        });
      }
    }
    grouped.set(key, rec);
  });
  grouped.forEach((c) => {
    c.notes.sort((a, b) => (a.at || 0) - (b.at || 0));
    const blob = `${c.branch} ${c.stateRaw} ` + c.notes.map((n) => n.text).join(" ");
    c.state =
      inferState(c.branch, c.stateRaw || "", "") ||
      meta.defaultState ||
      inferState("", "", blob) ||
      "GENERAL";
    c.ids = extractCaseIds(blob);
    const last = c.notes[c.notes.length - 1];
    c.lastNoteAt = last ? last.at : c.received || null;
  });
  return [...grouped.values()];
}

export function rowsToTasks(
  headers: string[],
  rows: string[][],
  fileName: string,
  operator: string,
): PipelineTask[] {
  const hm = mapHeaders(headers, TASK_ALIASES);
  if (hm.title === undefined) return [];
  const fileState = stateFromText(fileName);
  const out: PipelineTask[] = [];
  rows.forEach((r) => {
    const pick = (k: string) => (hm[k] === undefined ? "" : String(r[hm[k]!] ?? "").trim());
    const title = pick("title");
    if (!title) return;
    out.push({
      id: uid(),
      title,
      patient: pick("patient"),
      assignee: pick("assignee"),
      ref: pick("ref"),
      state: inferState("", pick("state"), "") || fileState || "GENERAL",
      priority: "auto",
      due: parseLooseDate(pick("due")),
      status: "Open",
      source: fileName,
      notes: [],
      createdAt: Date.now(),
      createdByName: operator || "anonymous",
      updatedAt: Date.now(),
    });
  });
  return out;
}

export function sampleCsv() {
  const header = [
    "SrNo",
    "ReferralName",
    "Branch",
    "ReceivedDate",
    "IntakePerson",
    "ReferralSource",
    "ReferralStatus",
    "NoteDate",
    "Author",
    "Note",
  ];
  const rows = [
    [
      "10421",
      "SAMPLE, DEMO",
      "Baltimore",
      "09/01/2026",
      "Intake Desk",
      "AERS Baltimore",
      "Initial Screening",
      "09/10/2026",
      "Intake Desk",
      "Left a VM for the member. No answer.",
    ],
  ];
  return [header, ...rows]
    .map((r) => r.map((v) => `"${v}"`).join(","))
    .join("\r\n");
}
