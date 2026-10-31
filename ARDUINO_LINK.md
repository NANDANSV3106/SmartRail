# Arduino link — smartrail_one_sensor1 (added 2026-10-31)

## What the received code does (read line by line before merging)

File: `smartrail_one_sensor1.ino` — the friend's current firmware.

- **Board:** Arduino Nano ESP32. USB Serial @ 115200 is the link to
  the laptop running `live_detection.py`.
- **Ultrasonic (1 sensor):** TRIG = pin 5, ECHO = A4, danger < 10 cm.
- **OLED:** SSD1306 128×64 on I2C A0/A1 (0x3C) — status display only.
- **GSM:** HardwareSerial(1) on pins 0/1 @ 115200, **SMS only**
  (AT+CMGF / AT+CMGS). No data/HTTP, and **no GPS in this build** —
  alerts carry no location (the older `1stFinal.ino` had GPS on
  D2/D3; this build dropped it). **No buzzer pin in this build** —
  dashboard Buzzer buttons cannot reach this board.
- **Phone numbers:** Driver + Station numbers are hardcoded in the
  code (real numbers). They receive every alert SMS.
- **Sensor alert:** on a new obstacle (< 10 cm, edge-triggered) it
  prints `ULTRASONIC HAZARD` and SMSes both numbers
  ("SMARTRAIL SENSOR ALERT! … Distance: X cm"), 30 s cooldown.
- **Camera/ML alert:** it receives `ML,<class>,<confidence>` lines
  from the Python script, needs the **same class 3 times in a row**
  (REQUIRED_COUNT) at **≥ 0.60** confidence, then prints
  `CAMERA HAZARD CONFIRMED` and SMSes both numbers
  ("SMARTRAIL CAMERA ALERT! Detected: …"), 30 s cooldown.
  `Clear track` 3× in a row clears the camera hazard state.
- It does **not** print the distance to Serial (OLED only), and
  before this merge it had **no path to the dashboard at all** —
  sensor alerts existed only as SMS.

## The merge (firmware/smartrail_one_sensor1_linked.ino)

The friend's file with **additions only** (diff-checked: no original
line changed, SMS logic / pins / numbers untouched). The additions
print extra lines on the same USB Serial:

| New line | When |
|---|---|
| `EVENT:OBSTACLE distance=<cm>` | ultrasonic hazard triggers |
| `EVENT:ML_CONFIRMED category=<class> confidence=<0-1>` | ML hazard confirmed (3× rule) |
| `EVENT:SMS_SENT` | after an alert SMS is sent |
| `Distance: <cm> cm` | every 2 s (live reading / heartbeat) |
| `Track clear.` | sensor obstacle clears (transition only) |

Plus a **Phase-2 GSM data block at the bottom, switched OFF**
(`ENABLE_GSM_DATA` not defined, marked UNTESTED): the A7670 HTTP
POST for the hosted battery node. Do not enable until hosting works
and it has been tested over plain HTTP.

## Who forwards what (the bridge)

`ml/live_detection.py` owns COM5, so it is the bridge (see
ML_LINK.md). Its new reader thread forwards the Arduino lines:

- `EVENT:OBSTACLE` → POST distance → **dashboard incident**
- `EVENT:ML_CONFIRMED` → POST mlClass/mlConfidence → merged into the
  same-station incident (sensor + camera become ONE incident,
  like the OLED's "MULTIPLE ALERTS")
- `EVENT:SMS_SENT` → re-posts the last alert with `smsSent: true`
- `Distance:` lines → heartbeat post every 10 s (health panel ONLINE)
- `Track clear.` → clear status post

The bridge also mirrors the Arduino's 3-count rule for its own ML
posts, so a single flickering frame never creates a dashboard
incident — dashboard and SMS now agree on what counts as a hazard.

## Steps to run the full chain

1. Flash `firmware/smartrail_one_sensor1_linked.ino` (Arduino IDE,
   board: Arduino Nano ESP32). Same wiring, nothing to rewire.
   - During flashing, the Python script must be stopped (it holds
     COM5).
2. Server: `.env` has a real `DEVICE_API_KEY`, `SERIAL_PORT=` empty,
   `npm start`.
3. Bridge: in `ml/live_detection.py` set the same `DEVICE_API_KEY`,
   `SERVER_BASE_URL = "http://localhost:3000"`,
   `STATION_NAME = "Mysuru"`, check `ARDUINO_PORT` (COM5), keep
   `smartrail_model.keras` beside it, run `python live_detection.py`.
   You should see `Arduino -> server forwarding: ON`.
4. Test sensor: put an object < 10 cm from the ultrasonic sensor.
   - Phones get the SMS (as before)
   - Script window: `Arduino: EVENT:OBSTACLE distance=…` then
     `Server: 200 {"ok":true,"obstacle":true…}`
   - Dashboard: incident at Mysuru, distance shown, SMS: sent after
     the `EVENT:SMS_SENT` follow-up lands
5. Test camera: show a person/animal/vehicle ~3 s. ML confirms,
   SMS goes out, and the SAME incident gains the blue
   **🤖 ML detected** box (or a new incident if the sensor is clear).

## Not yet / honest limits

- No GPS in this firmware → incidents have **no Maps link**. If the
  GPS module is still wired (it was on D2/D3 in the old code), say
  so and the GPS block can be merged back in the same additive way.
- No buzzer in this firmware → dashboard buzzer/ping buttons have
  nothing to drive on this board.
- Standalone battery use is **not** solved by this merge: while USB
  is unplugged, the board can still SMS (its own GSM), but the
  dashboard link needs either the laptop bridge (USB) or the
  Phase-2 GSM data path (hosted server, untested).

## Standalone / hosted — the ONLY deployment link (clarified 2026-10-31 06:30)

Nandan clarified: **the board is not connected to the laptop at all**
in deployment, so the USB bridge above is a bench/test setup only.
The deployment link is hosting, with **two independent reporters**
posting to the same hosted server (they merge into one incident per
station on the server):

1. **Sensor node (standalone, battery):** flash
   `firmware/smartrail_one_sensor1_hosted.ino` — the same code with
   the GSM-data block ON. On an alert it SMSes first (always), then
   POSTs over the A7670's SIM data to
   `https://<hosted>/api/device/ingest` with `deviceKey` inside the
   JSON body (the server accepts the key in the body because A7670
   HTTP headers are unreliable). Set `SERVER_URL` + `DEVICE_KEY` in
   the file before flashing. **UNTESTED on real hardware** — first
   test over an http:// test URL; https:// needs extra A7670
   certificate commands not in the file. If the Arduino IDE reports
   `gsmHttpPostObstacle was not declared`, move the whole Phase-2
   block to just above `setup()` — same code, earlier position.
2. **ML camera (needs its own computer + camera):** standalone, the
   board receives no ML lines (they arrived over USB), so the ML
   script posts its confirmed results **directly to the hosted
   server** — in `ml/live_detection.py` set
   `SERVER_BASE_URL = "https://<hosted>"`. It already does this; the
   Arduino-serial part simply goes unused in that setup.

**SMS recipients (clarified 2026-10-31):** `DRIVER_NUM` is the **TI**
(Traffic Inspector) and `STATION_NUM` is the **SS** (Station Master).
**The DOM receives no SMS at all** — the DOM sees alerts only on the
website. The dashboard incident card therefore reads
"SMS: sent to SS + TI".
