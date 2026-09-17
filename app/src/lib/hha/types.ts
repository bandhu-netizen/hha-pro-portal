export type NoteType =
  | "Outreach"
  | "Conversation"
  | "Scheduling"
  | "Documents"
  | "Intake"
  | "Note";

export type CaseNote = {
  id: string;
  at: number | null;
  author: string;
  type: NoteType;
  text: string;
};

export type ReferralCase = {
  id: string;
  srno: string;
  name: string;
  branch: string;
  stateRaw?: string;
  state: string;
  received: number | null;
  intake: string;
  manager: string;
  source: string;
  sourceContact: string;
  submittedTo: string;
  status: string;
  reason: string;
  notes: CaseNote[];
  ids: string[];
  lastNoteAt: number | null;
  due?: number | null;
  sourceFile: string;
  updatedAt: number;
};

export type TaskNote = {
  id: string;
  text: string;
  at: number;
  byName: string;
};

export type PipelineTask = {
  id: string;
  title: string;
  assignee: string;
  patient: string;
  state: string;
  priority: "auto" | "critical" | "high" | "medium" | "low";
  due: number | null;
  status: string;
  source: string;
  ref: string;
  notes: TaskNote[];
  createdAt: number;
  createdByName: string;
  updatedAt: number;
};

export type Reminder = {
  id: string;
  title: string;
  body: string;
  at: number;
  repeat: "once" | "daily" | "weekly";
  itemKey: string;
  status: "open" | "done";
  createdAt: number;
  createdBy: string;
};

export type AlertLogItem = {
  id: string;
  title: string;
  body: string;
  tag: string;
  itemKey: string;
  at: number;
};

export type NotifyPrefs = {
  due: boolean;
  stale: boolean;
  brief: boolean;
  briefTime: string;
  voice: boolean;
};

export type HydratedCase = ReferralCase & {
  kind: "case";
  displayName: string;
  last: CaseNote | null;
  days: number | null;
  priLabel: string;
  priClass: string;
};

export type HydratedTask = PipelineTask & {
  kind: "task";
  displayName: string;
  days: number | null;
  priLabel: string;
  priClass: string;
  intake: string;
  lastNoteAt?: number | null;
};

export type Item = HydratedCase | HydratedTask;

export type PipeFilters = {
  q: string;
  status: string;
  state: string;
  intake: string;
  age: string;
  kind: string;
  sort: string;
  kpi: string | null;
  view: "rank" | "list" | "board" | "focus";
};

export type NetworkRecord = {
  _id: string;
  name: string;
  region: string;
  Agency_NAME: string;
  address: string;
  NPI: string;
  Tax_ID: string;
  medicaid_id: string;
  provider_id: string;
  vendor_id: string;
  lara_id: string;
  phone: string;
  fax: string;
  email: string;
  pay_rate: string;
  img: string;
  local?: boolean;
};

export type JarvisMessage = {
  id: string;
  role: "jarvis" | "user";
  text: string;
  at: number;
};

export type ThemeMode = "system" | "light" | "dark";
