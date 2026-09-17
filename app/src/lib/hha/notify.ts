import { toast } from "sonner";

export type Alarm = {
  id: string;
  title: string;
  body: string;
  tag: string;
  fireAt: number;
  repeat?: "once" | "daily" | "weekly";
  data?: Record<string, unknown>;
};

let swReg: ServiceWorkerRegistration | null = null;

export function notifyAllowed() {
  return typeof Notification !== "undefined" && Notification.permission === "granted";
}

export function chime() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const nowT = ctx.currentTime;
    const beep = (t: number, f: number, dur: number, vol: number) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(t);
      o.stop(t + dur + 0.02);
    };
    beep(nowT, 660, 0.12, 0.08);
    beep(nowT + 0.14, 880, 0.16, 0.09);
    beep(nowT + 0.34, 1320, 0.22, 0.07);
    setTimeout(() => ctx.close(), 1200);
  } catch {
    /* audio blocked */
  }
}

function postToSW(msg: Record<string, unknown>) {
  return new Promise<boolean>((resolve) => {
    try {
      const worker = swReg && (swReg.active || navigator.serviceWorker.controller);
      if (!worker) return resolve(false);
      const ch = new MessageChannel();
      const t = setTimeout(() => resolve(true), 800);
      ch.port1.onmessage = () => {
        clearTimeout(t);
        resolve(true);
      };
      worker.postMessage(msg, [ch.port2]);
    } catch {
      resolve(false);
    }
  });
}

export async function registerSW(onOpen?: (item: string) => void) {
  if (!("serviceWorker" in navigator) || !window.isSecureContext) return null;
  try {
    swReg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;
    navigator.serviceWorker.addEventListener("message", (ev) => {
      const item = ev.data?.data?.item;
      if (ev.data?.type === "open" && item && onOpen) onOpen(item);
    });
    try {
      const reg = await navigator.serviceWorker.ready;
      const ps = (reg as ServiceWorkerRegistration & { periodicSync?: { register: Function } }).periodicSync;
      if (ps) await ps.register("hha-alarms", { minInterval: 15 * 60 * 1000 });
    } catch {
      /* no periodic sync */
    }
    return swReg;
  } catch {
    return null;
  }
}

export async function syncAlarms(alarms: Alarm[]) {
  await postToSW({ type: "sync", alarms });
}

export async function notifyOS(
  title: string,
  body: string,
  tag?: string,
  itemKey?: string,
) {
  chime();
  toast(title, { description: body });
  if (!notifyAllowed()) return false;
  const payload = {
    title,
    body: body || "",
    tag: tag || "hha-" + Date.now(),
    data: { url: location.href.split("#")[0], item: itemKey || null },
  };
  const sent = await postToSW({ type: "notify", ...payload });
  if (sent) return true;
  try {
    const n = new Notification(title, {
      body: payload.body,
      tag: payload.tag,
      icon: "/icon-128.png",
      requireInteraction: true,
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
    return true;
  } catch {
    return false;
  }
}

export async function enableNotifications() {
  if (!("Notification" in window)) {
    toast.error("This browser has no notification API.");
    return false;
  }
  const p = await Notification.requestPermission();
  if (p === "granted") {
    await registerSW();
    await notifyOS("JARVIS online", "Desktop alarms will land in the notification bar.", "welcome");
    return true;
  }
  toast.error("Alerts blocked — allow notifications in site settings.");
  return false;
}

export async function scheduleTest() {
  if (!notifyAllowed()) return enableNotifications();
  await registerSW();
  const fireAt = Date.now() + 8000;
  toast("Switch away or wait", { description: "Desktop alarm in 8 seconds." });
  await postToSW({
    type: "schedule",
    alarm: {
      id: "closed-test-" + fireAt,
      title: "JARVIS alarm",
      body: "Desktop notification path is live.",
      tag: "closed-test-" + fireAt,
      fireAt,
      repeat: "once",
      data: { url: location.href.split("#")[0] },
    },
  });
}

export function speakLocal(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.96;
  u.pitch = 0.85;
  u.volume = 0.9;
  const voices = window.speechSynthesis.getVoices();
  const pick =
    voices.find((v) => /en-GB/i.test(v.lang) && /male|daniel|google uk/i.test(v.name)) ||
    voices.find((v) => /en-GB/i.test(v.lang)) ||
    voices.find((v) => /en-US/i.test(v.lang) && /male|david|mark/i.test(v.name)) ||
    voices.find((v) => /^en/i.test(v.lang));
  if (pick) u.voice = pick;
  window.speechSynthesis.speak(u);
}

export function stopSpeak() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
}
