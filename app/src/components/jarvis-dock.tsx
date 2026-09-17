import { useEffect, useRef, useState } from "react";
import { Mic, Send, Sparkles, Volume2, VolumeX, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { askJarvis, speakJarvis } from "@/lib/hha/ask-jarvis";
import { parseJarvis } from "@/lib/hha/jarvis";
import { hydrateCase, hydrateTask, localBriefing, pipelineStats, workQueue } from "@/lib/hha/logic";
import { enableNotifications, speakLocal, stopSpeak } from "@/lib/hha/notify";
import { useHha } from "@/lib/hha/store";
import { cn } from "@/lib/utils";

function snapshot() {
  const s = useHha.getState();
  const cases = Object.values(s.cases).map(hydrateCase);
  const tasks = Object.values(s.tasks).map(hydrateTask);
  const st = pipelineStats(cases, tasks);
  const q = workQueue(cases, tasks, s.name, 8);
  return JSON.stringify({
    operator: s.name,
    stats: st,
    queue: q.map((i) => ({ title: i.title, why: i.why, tag: i.tag })),
    screening: cases.filter((c) => /screen/i.test(c.status)).slice(0, 8).map((c) => ({
      name: c.name,
      days: c.days,
      status: c.status,
      last: c.last?.text,
    })),
  });
}

export function JarvisDock() {
  const open = useHha((s) => s.jarvisOpen);
  const setOpen = useHha((s) => s.setJarvisOpen);
  const messages = useHha((s) => s.jarvis);
  const push = useHha((s) => s.pushJarvis);
  const name = useHha((s) => s.name);
  const nprefs = useHha((s) => s.nprefs);
  const setNav = useHha((s) => s.setNav);
  const setFilters = useHha((s) => s.setFilters);
  const setOpenItem = useHha((s) => s.setOpenItem);
  const cases = useHha((s) => s.cases);
  const tasks = useHha((s) => s.tasks);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const recRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  async function utter(say: string, preferCloud = false) {
    if (!nprefs.voice) return;
    setSpeaking(true);
    if (preferCloud) {
      try {
        const res = await speakJarvis({ data: { text: say } });
        if (res.ok) {
          const src = `data:${res.mime};base64,${res.audio}`;
          const audio = new Audio(src);
          audio.onended = () => setSpeaking(false);
          audio.onerror = () => {
            speakLocal(say);
            setSpeaking(false);
          };
          await audio.play();
          return;
        }
      } catch {
        /* fall through */
      }
    }
    speakLocal(say);
    setTimeout(() => setSpeaking(false), Math.min(8000, say.length * 60));
  }

  async function run(raw: string) {
    const q = raw.trim();
    if (!q) return;
    setText("");
    push({ role: "user", text: q });
    const hc = Object.values(cases).map(hydrateCase);
    const ht = Object.values(tasks).map(hydrateTask);
    const action = parseJarvis(q, { name, cases: hc, tasks: ht });

    if (action.type === "nav") {
      setNav(action.nav);
      push({ role: "jarvis", text: action.say });
      return;
    }
    if (action.type === "open") {
      setOpenItem(action.key);
      setNav("pipeline");
      push({ role: "jarvis", text: action.say });
      return;
    }
    if (action.type === "filter") {
      setFilters({
        kpi: action.kpi,
        status: action.status || "all",
        kind: "all",
        view: "rank",
        sort: "oldest",
      });
      setNav("pipeline");
      push({ role: "jarvis", text: action.say });
      return;
    }
    if (action.type === "focus") {
      setFilters({ view: "focus", sort: "oldest", kpi: null });
      setNav("pipeline");
      push({ role: "jarvis", text: action.say });
      return;
    }
    if (action.type === "next") {
      if (action.key) setOpenItem(action.key);
      setNav("pipeline");
      push({ role: "jarvis", text: action.say });
      void utter(action.say);
      return;
    }
    if (action.type === "script") {
      if (action.key) setOpenItem(action.key);
      push({ role: "jarvis", text: action.say });
      void utter(action.say);
      return;
    }
    if (action.type === "import") {
      setNav("pipeline");
      document.getElementById("hha-file")?.click();
      push({ role: "jarvis", text: action.say });
      return;
    }
    if (action.type === "alarms") {
      await enableNotifications();
      push({ role: "jarvis", text: action.say });
      return;
    }
    if (action.type === "brief") {
      push({ role: "jarvis", text: action.say });
      if (action.speak) void utter(action.say, true);
      return;
    }
    if (action.type === "noop") {
      push({ role: "jarvis", text: action.say });
      return;
    }

    setBusy(true);
    try {
      const res = await askJarvis({ data: { prompt: q, snapshot: snapshot(), name } });
      const say = res.ok ? res.text : action.say + " Local intellect only — the cloud line is quiet.";
      push({ role: "jarvis", text: say });
    } catch {
      push({ role: "jarvis", text: "The line dropped. Try a shorter order." });
    } finally {
      setBusy(false);
    }
  }

  function listen() {
    const w = window as Window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) {
      toast.error("Voice input is not available in this browser.");
      return;
    }
    if (listening) {
      recRef.current?.stop();
      setListening(false);
      return;
    }
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.onresult = (ev: SpeechRecognitionEvent) => {
      const said = ev.results[0]?.[0]?.transcript || "";
      setListening(false);
      if (said) void run(said);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  }

  const last = messages[messages.length - 1];

  return (
    <>
      <button
        type="button"
        aria-label="JARVIS"
        onClick={() => setOpen(!open)}
        className={cn(
          "jarvis-orb fixed right-4 z-40 grid size-14 place-items-center rounded-full border border-accent bg-surface text-accent shadow-[var(--shadow-panel)] md:bottom-5",
          "bottom-[max(1rem,env(safe-area-inset-bottom))]",
          listening && "listening",
        )}
      >
        <span className="font-display text-lg tracking-tight">J</span>
      </button>

      {open ? (
        <div className="fixed inset-x-3 bottom-[5.5rem] z-40 mx-auto flex max-h-[min(72vh,560px)] w-auto max-w-lg flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--shadow-panel)] md:right-4 md:left-auto md:w-[420px]">
          <div className="flex items-center gap-3 border-b border-line px-4 py-3">
            <div className="hud-ring grid size-9 place-items-center rounded-full border border-line text-xs font-semibold text-accent">
              J
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-display text-base leading-tight">JARVIS</div>
              <div className="text-[11px] text-muted">
                {busy ? "Consulting…" : listening ? "Listening" : speaking ? "Speaking" : "Standing by"}
              </div>
            </div>
            <button
              type="button"
              className="grid size-8 place-items-center rounded-md text-muted hover:bg-line"
              onClick={() => {
                if (speaking) {
                  stopSpeak();
                  setSpeaking(false);
                } else if (last) void utter(last.text, true);
              }}
              aria-label={speaking ? "Mute" : "Speak"}
            >
              {speaking ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
            </button>
            <button
              type="button"
              className="grid size-8 place-items-center rounded-md text-muted hover:bg-line"
              onClick={() => setOpen(false)}
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          </div>
          <div ref={scroller} className="scroll flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {messages.length === 0 ? (
              <p className="text-sm text-muted">
                Ask for a briefing, the next call, a stale list, or a script. You can also just say “next.”
              </p>
            ) : (
              messages.map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    "max-w-[92%] rounded-lg px-3 py-2 text-sm leading-relaxed",
                    m.role === "jarvis"
                      ? "bg-surface-2 text-fg"
                      : "ml-auto bg-accent-soft text-fg",
                  )}
                >
                  {m.text}
                </div>
              ))
            )}
            {busy ? <div className="shimmer h-8 rounded-lg bg-surface-2" /> : null}
          </div>
          <div className="flex flex-wrap gap-1.5 border-t border-line px-3 py-2">
            {[
              "Brief me",
              "Who should I call?",
              "Show stale",
              "Give me a script",
              "Focus mode",
            ].map((c) => (
              <button
                key={c}
                type="button"
                className="rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-muted hover:border-accent hover:text-fg"
                onClick={() => void run(c)}
              >
                {c}
              </button>
            ))}
          </div>
          <form
            className="flex items-center gap-2 border-t border-line px-3 py-2"
            onSubmit={(e) => {
              e.preventDefault();
              void run(text);
            }}
          >
            <button
              type="button"
              onClick={listen}
              className={cn(
                "grid size-9 place-items-center rounded-md border border-line",
                listening ? "bg-accent text-accent-fg" : "text-muted hover:bg-surface-2",
              )}
              aria-label="Listen"
            >
              <Mic className="size-4" />
            </button>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Order JARVIS…"
              className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
            />
            <Button type="submit" variant="primary" size="icon" disabled={busy} aria-label="Send">
              <Send className="size-4" />
            </Button>
          </form>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            if (messages.length === 0) {
              const hc = Object.values(cases).map(hydrateCase);
              const ht = Object.values(tasks).map(hydrateTask);
              const q = workQueue(hc, ht, name, 6);
              push({ role: "jarvis", text: localBriefing(name, hc, ht, q) });
            }
          }}
          className="fixed bottom-[max(5.5rem,calc(env(safe-area-inset-bottom)+4.5rem))] right-20 z-30 hidden items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-muted shadow-[var(--shadow-panel)] md:flex"
        >
          <Sparkles className="size-3.5 text-accent" />
          Ask JARVIS
        </button>
      )}
    </>
  );
}
