# HHA Pro · Cottage Homecare

Intake desk for Cottage Homecare: pipeline, alarms, network directory, and JARVIS.

## Download

**Unzip and run (recommended)**

https://github.com/bandhu-netizen/hha-pro-portal/releases/download/v2.0.0/hha-pro-portal.zip

Or grab the whole repo:

https://github.com/bandhu-netizen/hha-pro-portal/archive/refs/heads/main.zip

## Run the portal

Keep `hha-pro.html`, `sw.js`, and `icon-128.png` in the same folder.

Desktop alarms need a real web origin (not a double-clicked file). From that folder:

```
npx --yes serve -p 4173
```

Open the page it prints, then:

1. Enter your name
2. Open **Alerts**
3. Click **Enable desktop alarms** and allow Chrome
4. **Send test** or **Alarm in 8s**

Keep Chrome open (even in the background) so reminders can fire.

## Files

| File | Role |
|---|---|
| `hha-pro.html` | Portal you open in Chrome |
| `sw.js` | Background worker that writes OS notifications |
| `icon-128.png` | Notification icon |
| `app/` | Latest HHA Pro source (pipeline, JARVIS, alarms) |

## v2.0.0

Adds the current HHA Pro source snapshot (`app/`) next to the unzip-and-run portal.
