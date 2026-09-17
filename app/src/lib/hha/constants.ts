export const KEYS = {
  store: "hha-jarvis:v2",
  tab: "hha:tab:",
} as const;

export const US: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
  MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
  NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina",
  ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee",
  TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
  WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", DC: "District of Columbia",
};

export const NAME_TO_CODE = Object.fromEntries(
  Object.entries(US).map(([c, n]) => [n.toLowerCase(), c]),
);

export const CLOSED_RX = /declin|denied|cancel|closed|discharg|lost|not.?admit|withdraw|inactive|complete|admitted|started/i;
export const SCREEN_RX = /initial\s*screen/i;
export const HOLD_RX = /hold|waitlist|pending|wait/i;
export const MD_HINT = /maryland|\bmd\b|baltimore|prince george|pg county|montgomery county|anne arundel|harford county|howard county|catonsville|dundalk|glen burnie|reisterstown|bowie|columbia,\s*md|fort washington|silver spring|rockville/i;

export const CRM_ALIASES: Record<string, string[]> = {
  srno: ["srno", "sr", "caseno", "casenumber", "referralid", "referralno", "refno"],
  name: ["referralname", "patientname", "clientname", "name", "patient", "client", "member"],
  branch: ["branch", "office", "location", "market"],
  state: ["state", "st", "region"],
  received: ["receiveddate", "referraldate", "createddate", "startdate"],
  intake: ["intakeperson", "intake", "coordinator", "owner"],
  manager: ["accountmanager", "am", "manager"],
  source: ["referralsource", "source"],
  sourcecontact: ["referralsourcecontact", "sourcecontact"],
  submitted: ["submittedto"],
  status: ["referralstatus", "status", "stage", "pipeline"],
  reason: ["referralreason", "reason"],
  notedate: ["notedate", "notedatetime", "activitydate", "date"],
  author: ["author", "username", "user", "createdby", "enteredby"],
  note: ["note", "notes", "notetext", "description", "comment", "activity"],
  notetype: ["notetype", "activitytype", "type"],
};

export const TASK_ALIASES: Record<string, string[]> = {
  title: ["issue", "exception", "exceptionreason", "reason", "task", "description", "problem", "visitstatus", "denialreason", "note"],
  patient: ["patient", "patientname", "member", "client", "clientname", "consumer", "recipient"],
  assignee: ["assignee", "owner", "caregiver", "aide", "employee", "coordinator", "worker", "staff", "responsible"],
  due: ["duedate", "visitdate", "servicedate", "date", "scheduleddate", "dos", "dateofservice", "startdate"],
  state: ["state", "region", "office", "location", "market", "branch", "territory", "st"],
  ref: ["visitid", "id", "recordid", "admissionid", "patientid", "confirmationnumber", "claimid", "ref"],
};

export const NET_AUTH = {
  user: "intake@cottagehomecare.com",
  pass: "intake@12345",
};

export const NET_API = "https://api.cottagehome.care/all-states-name";
export const NET_KEY = "cottageadminmrdev";

export const TASK_STATUSES = ["Open", "In progress", "Waiting on agency", "Resolved"] as const;

export const NAV = [
  { id: "overview", label: "Command", kicker: "Today" },
  { id: "pipeline", label: "Pipeline", kicker: "HHA Exchange" },
  { id: "alerts", label: "Alarms", kicker: "Reminders" },
  { id: "network", label: "Network", kicker: "Directory" },
  { id: "settings", label: "Systems", kicker: "Workspace" },
] as const;

export type NavId = (typeof NAV)[number]["id"];
