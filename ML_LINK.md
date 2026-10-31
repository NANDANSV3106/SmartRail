# Linking the ML camera (live_detection.py) to SmartRail — added 2026-10-31

## What the ML script actually is (from reading the code Nandan sent)

- Runs on a **laptop** (TensorFlow + OpenCV), NOT on the Arduino.
- Model: `smartrail_model.keras` — **not sent yet**, the server does not
  need it; only this script loads it.
- Camera: laptop webcam (`CAMERA_URL = 0`); the code comment says an
  ESP32-CAM stream URL can replace it later.
- Input: frames resized to 160×160, RGB, float32. **Check:** the script
  does NOT divide pixels by 255. If the model has no Rescaling layer
  inside it and training used 0–1 pixels, predictions will be weak.
  If training used raw 0–255 pixels, the script is correct as-is.
  Confirm from the training code before changing anything.
- Inference every 10 frames; below **0.60** confidence the result is
  `UNKNOWN / RECHECK` and never creates an incident.
- Classes: `Animals on track`, `Clear track`, `Human on track`,
  `Obstacles on track`, `Vehicles on track`.
- Board: **Arduino Nano ESP32**, USB serial **COM5 @ 115200**. Every
  1 second the script sends the Arduino: `ML,<class>,<confidence>`
  e.g. `ML,Human on track,0.87`.

## The link (who talks to whom)

```
Camera → laptop live_detection.py ──USB COM5──► Arduino Nano ESP32
                    │
                    └──── HTTP POST ────► SmartRail server ──► Dashboard
                         /api/device/ingest   (mlClass + mlConfidence)
```

The Python script is the bridge, on purpose: **it owns COM5**, so the
Node server must NOT also open COM5 (`SERIAL_PORT` stays empty in
`.env` while the ML script is running — two programs cannot share one
COM port). The server also understands `ML,...` lines on serial for
the case where the Arduino forwards them and the server holds the
port, but do not run both paths at once.

What the server does with an ML post:
- `Human / Animals / Vehicles / Obstacles on track` → creates (or
  merges into) an incident with `mlClass` + `mlConfidence` stored on
  it; the dashboard card shows **🤖 ML detected: … · Confidence: …%**.
- `Clear track` / `UNKNOWN` → live status only, **no incident**.
- The ML result does **not** replace the SS assessment — the SS still
  confirms the obstacle on the dashboard.

## Steps to link (local, today)

1. Server: in the SmartRail folder, `.env` — set a real
   `DEVICE_API_KEY` (any long random string). Leave `SERIAL_PORT=`
   empty. Then `npm start`.
2. ML script: use `ml/live_detection.py` from this project (it is
   Nandan's script + the server-post block, nothing else changed).
   At the top set:
   - `DEVICE_API_KEY` = the **same** value as the server `.env`
   - `SERVER_BASE_URL = "http://localhost:3000"`
   - `STATION_NAME = "Mysuru"` (the station this camera watches)
3. Put `smartrail_model.keras` in the same folder as the script,
   connect the Arduino (check the COM number in Device Manager — if
   it is not COM5, change `ARDUINO_PORT`), and run:
   `python live_detection.py`
   Needs: `pip install tensorflow opencv-python pyserial requests`
   (only `requests` is new).
4. Show a person / animal / vehicle to the camera. In the script
   window you should see `Server: 200 {"ok":true,"obstacle":true,...}`.
   In the server terminal: `[ingest] Mysuru … ml=Human on track @ 0.87`.
   On the dashboard (login TGSMYS): a new incident with the blue
   **🤖 ML detected** box.
5. No Arduino handy? Skip it only for a server test — the Arduino
   `SystemExit` on connect failure is still in the script, so for a
   camera-only test, test the server with the curl/node one-liner in
   README instead.

## Long term (hosted, battery node)

- Change **one line**: `SERVER_BASE_URL = "https://<your-app>.onrender.com"`.
  The ML laptop/edge computer can then be anywhere with internet.
- The ML still runs on a computer, not on the Nano ESP32 — long-term
  the camera side needs its own trackside computer (or ESP32-CAM
  streaming to a computer that runs this script). The battery
  ultrasonic/GSM node's hosted link (A7670 mobile data) is separate
  and still waits on the friend's updated `.ino` code.
