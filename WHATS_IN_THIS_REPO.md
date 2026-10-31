# What's in this repo — WEBSITE ONLY (cleaned 2026-10-31)

This repo is only what Render runs: the SmartRail website/server.
NOT in this repo, on purpose — they run elsewhere:
  - live_detection.py (ML)  -> runs on the ML computer
  - smartrail_one_sensor1.ino (firmware) -> flashed to the board
Both are in the full SmartRail.zip backup and in your_files.

Do not delete the `hardware/` folder here: despite the name,
hardware/serialService.js is server JavaScript that server.js
requires — the site crashes without it.
