# HHA Pro · Cottage Homecare

Portal with **desktop alarm notifications** (same idea as the Maryland HHAeXchange Chrome extension: the reminder pops in the computer notification bar).

## Download

Use the latest zip from **Releases**, or:

https://github.com/bandhu-netizen/hha-pro-portal/archive/refs/heads/main.zip

## Run

Keep `hha-pro.html`, `sw.js`, and `icon-128.png` in the same folder.

Desktop alarms need a real web origin (not a double-clicked file). From that folder:

```
npx --yes serve -p 4173
```

Open the page Chrome shows, then:

1. Enter your name
2. Open **Alerts**
3. Click **Enable desktop alarms** and allow Chrome
4. **Send test** or **Alarm in 8s**

Keep Chrome open (even in the background) so reminders can fire.

## Files

| File | Role |
|---|---|
| `hha-pro.html` | Portal |
| `sw.js` | Background worker that writes OS notifications |
| `icon-128.png` | Notification icon |
