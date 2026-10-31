# SmartRail — obstacle detection for railway tracks

A trackside node detects an object (ultrasonic distance **< 10 cm**),
sounds a buzzer, sends an SMS with a Google Maps link (GSM A7670 + GPS),
and a staff web app lets station staff see and handle the alert.

```
Sensor / GPS / GSM node --USB or Wi-Fi--> Node.js + Express --> MongoDB (smart-train-db)
                                                              |
                                                     Staff dashboard (browser)
```

**Dashboard UI (redesigned 2026-10-30):** the login page has a full-screen
train photo background (`public/train-bg.jpg`, bundled locally — no internet
needed for the image) with a glass login card and the Indian Railways logo
as a circle. The login hero reads "Welcome to ODNMS — Obstacle Detection &
Notification Management System — Ensuring railway safety through real-time
AI monitoring." and carries no helper text; the password field has an eye
icon to show/hide the password. After login there is a sticky header, a
train hero banner with a LIVE indicator, stat cards, and upgraded
incident / health / trains panels. To change the background photo,
replace `public/train-bg.jpg`.

## Current hardware profile (2026-10-31 — built to the latest codes)

This build matches the codes Nandan sent on 2026-10-31, which changed
from the older build the software was first written for:

| Part | Latest code | Software consequence |
|---|---|---|
| Board | Arduino Nano ESP32, USB @ 115200 | Link runs through the laptop bridge |
| Sensor | **One** ultrasonic, TRIG 5 / ECHO A4, < 10 cm | Sensor incidents carry distance only |
| Camera ML | Laptop (`ml/live_detection.py`), 5 classes, ≥ 0.60, **3-in-a-row** confirmation in the firmware | Dashboard uses the same 3-count rule; ML box on the incident card |
| GSM | A7670 — **SMS** to SS (station number) + TI (driver number); **DOM gets no SMS, website only**. Data link = hosted variant firmware (GSM HTTP post) | Incident card reads "SMS: sent to SS + TI"; standalone board posts to the hosted server over SIM data |
| GPS | **None in this firmware** (older code had it) | No Maps link on incidents; dashboard does not claim GPS |
| Buzzer | **None in this firmware** | No buzzer/ping buttons on the dashboard |
| Display | OLED on the board (A0/A1) | Board-side only, not in the web app |

Firmware for this board: bench/USB test = `firmware/smartrail_one_sensor1_linked.ino`; standalone hosted deployment (the real setup — the board is NOT connected to a laptop) = `firmware/smartrail_one_sensor1_hosted.ino`. Both are the friend's code + additions only. Linking guide: `ARDUINO_LINK.md`
and `ML_LINK.md`. The older `firmware/smartrail_node*.ino` files are
kept for reference only — do NOT flash them on this board.

## The database — only 4 collections

Database name: **smart-train-db** (as in your Compass screenshots).
In MongoDB Compass you will see exactly these collections:

| Collection | What it holds |
|---|---|
| `users` | Staff logins. See fields below. |
| `incidents` | Obstacle alerts, with train, station, status and who assessed / resolved them. |
| `health_alerts` | Hardware status — one live record per node (online/offline, sensor, GPS, GSM, buzzer, last distance, last seen). |
| `trains` | Train list. Only `trainNumber` and `trainName` are required, plus optional from/to stations. |

### users
```
username: "Mysuru Station Master"
user_id:  "TGSMYS"          <- login id (not an email)
password: <bcrypt hash>     <- never plain text in the database
department: "StationMaster" | "TrafficInspector" | "RailwayAdmin"
station: "Mysuru" | "Mandya" | "Bengaluru" | "" (DOM)
designation: "SS" | "TI" | "DOM"
```
Designation = scope: **SS** = Station Master, one station only;
**TI** = Traffic Inspector, one section, read-only supervisory view;
**DOM** = Divisional Operations Manager, whole division, creates
accounts and trains, deletes incidents.

### incidents
```
trainNumber: "12639"
trainName: "Brindavan SF Express"   (copied from trains at creation/assessment)
nearestStation: "Mandya" / "Mysuru"
status: "New" | "Acknowledged" | "Assessed" | "Resolved"
reportedAt, assessedAt, assessedBy (User ObjectId),
resolvedAt, resolvedBy (User ObjectId)
assessmentDetails: { obstacleType, casualtyCount, severity,
                     forestDeptNotified, policeNotified }
distanceCm, latitude, longitude, mapsUrl, smsSent, history
```
The sensor cannot tell a human from an animal — `obstacleType` is the
SS's on-site assessment, not a hardware classification. Forest/Police
flags are recorded on the incident only; they do not send a real
message yet.

### trains
```
trainNumber: "12639"   (unique)
trainName: "Brindavan SF Express"
fromStation / toStation: optional
```
Seeded train: **12639 — Brindavan SF Express** (Chennai Central to
KSR Bengaluru). The DOM can add, edit and delete trains in the
dashboard (Trains panel) or via `POST /api/trains`.

## Run it on localhost (Windows)

You deleted your old files, so start clean with this zip:

```
1. Extract the zip to a folder, e.g. C:\Users\nandu\Downloads\SmartRail
2. In that folder:  npm install
3. Copy the settings:  copy .env.example .env
4. Start:  npm start
5. Open:  http://localhost:3000/staff.html
```

Check the server terminal after `npm start`:
- `[db] Connected to MongoDB` = real persistence in `smart-train-db`.
- `[db] Running with in-memory storage` = MongoDB is not running /
  `MONGO_URI` is wrong. The dashboard still works, but incidents and
  accounts are lost on restart. Start MongoDB (Compass shows
  `localhost:27017`) and restart the server.

### First-run logins (seeded ONLY if the users collection is empty)

If your old `smart-train-db` is still on your PC, seeding does NOT
run and your old user_ids / passwords keep working — nothing is
overwritten. If the database is empty, these are created.
**Change them before hosting. They are NOT printed on the login page.**

| Username | User ID | Password | Role |
|---|---|---|---|
| Mysuru Station Master | TGSMYS | Mysuru123! | SS, Mysuru (only SS) |
| Traffic Inspector | TGSTI | Traffic123! | TI, section-1 (read-only) |
| Senior DOM | TGSDOM | DOM123! | DOM, all stations |

Exactly these 3 accounts (Nandan's structure, 2026-10-31) — there are
no Mandya/Bengaluru SS accounts anymore. The DOM can create further
accounts in the dashboard (Create account panel) if ever needed.
Set `SEED_DEMO_USERS=false` in `.env` to skip seeding entirely.
Note: seeding runs only when the users collection is EMPTY — an
existing database (e.g. his local smart-train-db) keeps its old
accounts until they are deleted there.

### No-hardware demo (optional, before the board test)
```
Stop the server (Ctrl+C), set SIMULATE_DEVICE=true in .env, npm start.
The dashboard shows ONLINE / track clear.
In a second terminal, with your DEVICE_API_KEY from .env:
node -e "fetch('http://localhost:3000/api/device/ingest',{method:'POST',headers:{'Content-Type':'application/json','x-device-key':'YOUR_KEY'},body:JSON.stringify({distanceCm:7,nearestStation:'Mysuru',trainNumber:'12639',smsSent:true})}).then(r=>r.text()).then(console.log)"
```
Expect `obstacle: true` and an incident. Afterwards set
`SIMULATE_DEVICE=false` and restart, or the simulated ONLINE status
will hide whether the real board is connected.

## ML camera link (added 2026-10-31)

Full steps in `ML_LINK.md`. Short version: `ml/live_detection.py`
(Nandan's TensorFlow/OpenCV script, classes: Animals / Clear / Human /
Obstacles / Vehicles on track) runs on a laptop, sends
`ML,<class>,<confidence>` to the Arduino Nano ESP32 over USB COM5, and
now ALSO posts the same result to `POST /api/device/ingest` with
`mlClass` + `mlConfidence` and the device key. An ML obstacle class
creates an incident even without `distanceCm`; the dashboard card
shows **🤖 ML detected: … · Confidence: …%**. `Clear track` / `UNKNOWN`
(< 0.60 confidence) never create incidents. The ML detection does not
replace the SS assessment. While the ML script runs it owns COM5 —
leave `SERIAL_PORT` empty in `.env`.

## API (all staff routes need a Bearer token from login)

- `POST /api/auth/login` — `{ user_id, password }` → `{ token, user }`
- `GET  /api/auth/me`, `POST /api/auth/register` (DOM), `GET /api/auth/users` (DOM)
- `GET  /api/incidents?status=&trainNumber=&nearestStation=` (scoped by SS/TI/DOM)
- `POST /api/incidents/:id/acknowledge|assess|resolve|clear-track` (SS own station, or DOM; TI read-only)
- `DELETE /api/incidents/:id` (DOM)
- `GET  /api/trains`, `POST /api/trains` (DOM), `PUT/DELETE /api/trains/:id` (DOM)
- `GET  /api/health` — nodes + health_alerts, scoped
- `GET  /api/device/status`, `POST /api/device/buzzer|ping` (staff login)
- `POST /api/device/ingest` — device key (`x-device-key`), NOT staff login
- `GET  /api/device/commands?stationId=Mysuru` — device key, queued buzzer/ping

## How hardware links to software — short version

Full steps are in `HARDWARE.md` (USB + Wi-Fi + GSM SMS) and
`WIFI_SETUP.md` (Wi-Fi troubleshooting table).

- **USB:** board plugged into the PC running the server. In `.env`
  set `SERIAL_PORT=COM3` (find it in Device Manager / Arduino IDE →
  Tools → Port) and `NODE_STATION_NAME` to your station, then
  `npm install serialport` is already an optional dependency —
  `npm install` covers it. The board must stay plugged in.
- **Battery / Wi-Fi (ESP32 only):** unplugging USB ends the USB link.
  Battery only supplies power. Flash `firmware/smartrail_node_wifi.ino`,
  set `WIFI_SSID`, `WIFI_PASSWORD`, `SERVER_BASE`,
  `DEVICE_API_KEY` (same as `.env`), and `STATION_ID` to your station
  NAME (`Mysuru`, `Mandya` or `Bengaluru`). Demo: laptop and board on
  the same 2.4 GHz phone hotspot, `SERVER_BASE` =
  `http://<laptop Wi-Fi IP>:3000` (from `ipconfig`, never `localhost`).
  Hosted: `SERVER_BASE = "https://<your-app>.onrender.com"` (no port).
  The board posts every 10 s and immediately on an obstacle < 10 cm,
  and polls `/api/device/commands` every 5 s for queued buzzer/ping.
- **GSM SMS:** the board itself sends the SMS (A7670) with distance
  and a Google Maps link. Replace `ALERT_PHONE` (`+91XXXXXXXXXX`
  placeholder) with a real number in the firmware, or no SMS arrives.
  The dashboard `smsSent` flag only records that the board reported it.

## Hosting — short version

Full steps are in `HOSTING.md`. In order: (1) MongoDB Atlas, database
`smart-train-db`; (2) Render Web Service from Git (not a zip),
build `npm install`, start `npm start`; (3) set on Render, never in a
committed `.env`: `MONGO_URI`, strong `JWT_SECRET`,
`DEVICE_API_KEY` (same as firmware), `SEED_DEMO_USERS=false`, and
strong DOM seed credentials; (4) verify `/api/ping` and a DOM login;
(5) only then change the firmware `SERVER_BASE` to the hosted URL and
re-flash. Nothing is deployed by this zip itself.
