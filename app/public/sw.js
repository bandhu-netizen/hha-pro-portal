/* HHA Pro — desktop alarm worker
   Same job as the Maryland extension service worker:
   chrome.notifications.create + chrome.alarms → OS notification center. */

const DB_NAME = "hha-pro-alarms";
const STORE = "alarms";
const ICON = "/icon-128.png";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    await self.clients.claim();
    await flushDue();
    armWatch();
  })());
});

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function putAlarm(alarm) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(alarm);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteAlarm(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function allAlarms() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

function alarmOptions(alarm) {
  return {
    body: alarm.body || "",
    tag: alarm.tag || alarm.id || `hha-${Date.now()}`,
    icon: ICON,
    badge: ICON,
    renotify: true,
    requireInteraction: true,
    silent: false,
    vibrate: [220, 80, 220, 80, 420],
    timestamp: alarm.fireAt || Date.now(),
    data: alarm.data || {},
    actions: [
      { action: "open", title: "Open HHA Pro" },
      { action: "dismiss", title: "Dismiss" }
    ]
  };
}

async function showAlarm(alarm) {
  const opts = alarmOptions(alarm);
  try {
    await self.registration.showNotification(alarm.title || "HHA Pro reminder", opts);
  } catch (_) {
    try {
      delete opts.actions;
      await self.registration.showNotification(alarm.title || "HHA Pro reminder", opts);
    } catch (__) {}
  }
}

async function flushDue() {
  const now = Date.now();
  const list = await allAlarms().catch(() => []);
  for (const alarm of list) {
    if (!alarm || alarm.fireAt == null) continue;
    if (alarm.fireAt > now + 250) continue;
    await showAlarm(alarm);
    if (alarm.repeat === "daily") {
      let next = alarm.fireAt + 86400000;
      while (next <= now) next += 86400000;
      await putAlarm({ ...alarm, fireAt: next });
    } else if (alarm.repeat === "weekly") {
      let next = alarm.fireAt + 7 * 86400000;
      while (next <= now) next += 7 * 86400000;
      await putAlarm({ ...alarm, fireAt: next });
    } else {
      await deleteAlarm(alarm.id);
    }
  }
  armWatch();
}

let watchTimer = null;
function armWatch() {
  if (watchTimer) clearTimeout(watchTimer);
  allAlarms().then((list) => {
    const now = Date.now();
    const upcoming = list
      .map((a) => a.fireAt)
      .filter((t) => typeof t === "number" && t > now)
      .sort((a, b) => a - b)[0];
    const wait = upcoming
      ? Math.max(800, Math.min(upcoming - now + 200, 25000))
      : 25000;
    watchTimer = setTimeout(() => {
      flushDue();
    }, wait);
  }).catch(() => {
    watchTimer = setTimeout(() => flushDue(), 25000);
  });
}

self.addEventListener("message", (event) => {
  const msg = event.data || {};
  const reply = () => {
    try { event.ports && event.ports[0] && event.ports[0].postMessage({ ok: true }); } catch (_) {}
  };

  if (msg.type === "notify") {
    event.waitUntil((async () => {
      await showAlarm({
        id: msg.tag || `hha-${Date.now()}`,
        title: msg.title || "HHA Pro",
        body: msg.body || "",
        tag: msg.tag,
        fireAt: Date.now(),
        data: msg.data || {}
      });
      reply();
    })());
    return;
  }

  if (msg.type === "delay-notify" || msg.type === "schedule") {
    const alarm = msg.alarm || {
      id: msg.tag || `hha-${Date.now()}`,
      title: msg.title || "HHA Pro reminder",
      body: msg.body || "",
      tag: msg.tag,
      fireAt: msg.fireAt || Date.now(),
      repeat: msg.repeat || "once",
      data: msg.data || {}
    };
    event.waitUntil((async () => {
      await putAlarm(alarm);
      const wait = Math.max(0, (alarm.fireAt || 0) - Date.now());
      if (wait <= 28000) {
        await new Promise((resolve) => setTimeout(resolve, wait));
        await flushDue();
      } else {
        armWatch();
        await flushDue();
      }
      reply();
    })());
    return;
  }

  if (msg.type === "cancel") {
    event.waitUntil(deleteAlarm(msg.id).then(reply));
    return;
  }

  if (msg.type === "sync") {
    event.waitUntil((async () => {
      const incoming = Array.isArray(msg.alarms) ? msg.alarms : [];
      const existing = await allAlarms().catch(() => []);
      for (const old of existing) {
        if (!incoming.some((a) => a.id === old.id)) await deleteAlarm(old.id);
      }
      for (const alarm of incoming) await putAlarm(alarm);
      await flushDue();
      reply();
    })());
    return;
  }

  if (msg.type === "ping") {
    event.waitUntil(flushDue().then(reply));
  }
});

self.addEventListener("notificationclick", (event) => {
  const action = event.action;
  event.notification.close();
  if (action === "dismiss") return;
  const data = event.notification.data || {};
  const url = data.url || "/";
  event.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of list) {
      try {
        client.postMessage({ type: "open", data });
        if ("focus" in client) return client.focus();
      } catch (_) {}
    }
    if (self.clients.openWindow) return self.clients.openWindow(url);
  })());
});

self.addEventListener("periodicsync", (event) => {
  if (event.tag === "hha-alarms") event.waitUntil(flushDue());
});

self.addEventListener("sync", (event) => {
  if (event.tag === "hha-alarms") event.waitUntil(flushDue());
});

armWatch();
