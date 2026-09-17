import type { NavId } from "./constants";
import { firstName, localBriefing, pipelineStats, workQueue } from "./logic";
import type { HydratedCase, HydratedTask, JarvisMessage } from "./types";

export type JarvisAction =
  | { type: "nav"; nav: NavId; say: string }
  | { type: "open"; key: string; say: string }
  | { type: "filter"; kpi: string | null; status?: string; say: string }
  | { type: "focus"; say: string }
  | { type: "brief"; say: string; speak: boolean }
  | { type: "alarms"; say: string }
  | { type: "import"; say: string }
  | { type: "next"; key: string | null; say: string }
  | { type: "script"; key: string; say: string }
  | { type: "ask"; prompt: string; say: string }
  | { type: "noop"; say: string };

function sayReady(name: string, text: string) {
  const who = firstName(name);
  return text.replace(/\bsir\b/gi, who === "sir" ? "sir" : who);
}

export function parseJarvis(
  raw: string,
  ctx: {
    name: string;
    cases: HydratedCase[];
    tasks: HydratedTask[];
  },
): JarvisAction {
  const q = raw.trim().toLowerCase();
  const queue = workQueue(ctx.cases, ctx.tasks, ctx.name, 8);
  const st = pipelineStats(ctx.cases, ctx.tasks);
  const name = ctx.name;

  if (!q) return { type: "noop", say: "Standing by." };

  if (/^(hi|hello|hey|jarvis)\b/.test(q) && q.length < 18) {
    return {
      type: "brief",
      speak: false,
      say: `${localBriefing(name, ctx.cases, ctx.tasks, queue)} How can I help?`,
    };
  }

  if (/brief|status|sitrep|what's going|whats going|good morning|systems/.test(q)) {
    return { type: "brief", speak: true, say: localBriefing(name, ctx.cases, ctx.tasks, queue) };
  }

  if (/speak|say that|read (it|that)|out loud/.test(q)) {
    return { type: "brief", speak: true, say: localBriefing(name, ctx.cases, ctx.tasks, queue) };
  }

  if (/pipeline|referrals|cases/.test(q) && /open|show|go|take/.test(q)) {
    return { type: "nav", nav: "pipeline", say: `Pipeline. ${st.total} cases on the board.` };
  }
  if (/alarm|alert|reminder/.test(q) && /open|show|go/.test(q)) {
    return { type: "nav", nav: "alerts", say: "Alarms panel." };
  }
  if (/network|directory|coverage/.test(q)) {
    return { type: "nav", nav: "network", say: "Network coverage." };
  }
  if (/setting|theme|system/.test(q) && /open|show|go/.test(q)) {
    return { type: "nav", nav: "settings", say: "Systems." };
  }
  if (/overview|command|home|today/.test(q) && /open|show|go|back/.test(q)) {
    return { type: "nav", nav: "overview", say: "Command deck." };
  }

  if (/stale|cold|14/.test(q)) {
    return {
      type: "filter",
      kpi: "stale",
      say: `${st.stale} referrals have gone quiet. Ranking them now.`,
    };
  }
  if (/screen/.test(q)) {
    return {
      type: "filter",
      kpi: "screen",
      status: "__screen__",
      say: `${st.screening} in initial screening.`,
    };
  }
  if (/focus|one at a time|next call queue/.test(q)) {
    return { type: "focus", say: "Focus mode. One referral at a time." };
  }

  if (/next|who (do|should) i (call|touch)|first up|what now|do this/.test(q)) {
    const first = queue[0];
    if (!first)
      return { type: "noop", say: "Nothing in the queue. The desk is clear." };
    return {
      type: "next",
      key: first.key,
      say: `First up: ${first.title}. ${first.why}`,
    };
  }

  if (/script|what (do i|should i) say|talking points/.test(q)) {
    const first = queue.find((q) => q.script) || queue[0];
    if (!first?.script)
      return { type: "noop", say: "No outreach script on the current item." };
    return { type: "script", key: first.key, say: first.script };
  }

  if (/import|drop|upload|ingest/.test(q)) {
    return { type: "import", say: "Drop an HHA Exchange export and I'll split it by state." };
  }

  if (/enable (alarm|notif)|desktop alarm|notify me/.test(q)) {
    return { type: "alarms", say: "I'll request desktop alarms on this computer." };
  }

  const hit = [...ctx.cases, ...ctx.tasks].find((c) =>
    c.displayName.toLowerCase().includes(q.replace(/^(open|find|show|go to)\s+/, "")),
  );
  if ((/open|find|show|go to/.test(q) || q.split(/\s+/).length <= 3) && hit) {
    return {
      type: "open",
      key: hit.kind + ":" + hit.id,
      say: `Opening ${hit.displayName}.`,
    };
  }

  return {
    type: "ask",
    prompt: raw,
    say: sayReady(name, "Consulting the full picture."),
  };
}

export function openingLine(name: string, cases: HydratedCase[], tasks: HydratedTask[]): JarvisMessage {
  const queue = workQueue(cases, tasks, name, 6);
  return {
    id: "boot",
    role: "jarvis",
    at: Date.now(),
    text: localBriefing(name, cases, tasks, queue),
  };
}
