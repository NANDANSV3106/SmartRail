# Hosting SmartRail — Atlas + Render (prepared plan, not yet deployed)

Status: localhost build is done. Nothing here is deployed yet, and
nothing in your local `SmartRail` folder changes until you choose to
follow these steps. Do the steps in this order — Atlas first, so the
hosted app has real persistence from its first start.

## 1. MongoDB Atlas (data)

Create a free Atlas cluster and a database user, allow network access
from anywhere (`0.0.0.0/0`) for a first deployment, and copy the
connection string. It looks like:

```
mongodb+srv://<username>:<password>@<cluster>/<database>?retryWrites=true&w=majority
```

Use it as `MONGO_URI` on Render (step 2), with database name
`smart-train-db`, e.g.
`mongodb+srv://<username>:<password>@<cluster>/smart-train-db?retryWrites=true&w=majority`.
Do not reuse your local `mongodb://127.0.0.1:27017/smart-train-db`
value — that address only exists on your own PC.

Check after deploy: the Render log should show a MongoDB connection,
not the `[db] Running with in-memory storage` warning. In-memory mode
loses incidents and accounts on every restart, so it is not hosting.

## 2. Render (app)

- New Web Service, connected to the SmartRail repo (push this folder
  to GitHub first; Render deploys from Git, not from a zip).
- Build command: `npm install`
- Start command: `npm start`
- No `PORT` value to set: `server.js` already uses
  `process.env.PORT || 3000`, and Render supplies its own port.
- Free-tier note: a free Render web service spins down after a period
  without traffic, so the first request after idle can take tens of
  seconds. While a Wi-Fi board is online its 10-second heartbeat keeps
  traffic flowing; a dashboard with no board attached will be slow on
  first open. That is a demo trade-off, not a bug.

## 3. Environment variables to set on Render (never in a zip or repo)

| Variable | Value |
|---|---|
| `MONGO_URI` | Atlas connection string from step 1 |
| `JWT_SECRET` | A long random string you generate — do not leave the code default `dev-secret-change-me`, which anyone reading the code would know |
| `DEVICE_API_KEY` | A long random string — this must match the board firmware exactly |
| `SEED_DEMO_USERS` | `false` — stops the seed users (TGSMYS / TGSMYA / TGSSBC / TGSDOM) from being created on the hosted app |
| `NODE_STATION_NAME` | The station name for a USB node, e.g. `Mysuru` (only if you use USB on the host — normally no USB node on Render) |
| `NODE_SECTION_ID` | `section-1` |

After first deploy, create your real DOM account in MongoDB / via a
one-off seed, then log in with its `user_id` — do not leave the
seed passwords on a public site. The login page does NOT print demo
logins in this build.

Do not copy your local `.env` to Render or commit it. Set each value
in Render's Environment settings instead.

## 4. Verify the hosted app before touching the board

1. Open `https://<your-app>.onrender.com/api/ping` — expect
   `{"ok":true,"service":"smartrail"}`.
2. Open `https://<your-app>.onrender.com/staff.html` and log in as DOM.
3. Confirm the dashboard shows no demo SS/TI data you did not create.

## 5. Point the battery board at the hosted app

Only after step 4 works, in `firmware/smartrail_node_wifi.ino`:

```
SERVER_BASE = "https://<your-app>.onrender.com"
```

No port number. Re-flash over USB, then run on battery. The board
posts a heartbeat every 10 seconds and an obstacle immediately when
something is closer than 10 cm. Dashboard buzzer/ping are queued and
picked up by the board within about 5 seconds.

This replaces the localhost demo address
(`http://<laptop Wi-Fi IP>:3000`) — do not use `localhost` on the
board, it means the board itself.

## 6. What hosting does not change

- The Wi-Fi board test and the MongoDB check are still unconfirmed
  from your side; hosting does not prove the board link works, it only
  moves the server it talks to.
- The SS assessment (Human / Animal / Vehicle / Boulder) is still a
  human on-site judgement — the ultrasonic sensor cannot classify an
  obstacle, and no camera/classifier has been added.
- Forest / Police notification flags are still records on the incident
  only; they do not send a real message yet.
