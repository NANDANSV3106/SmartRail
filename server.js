require('dotenv').config();
const path = require('path');
const express = require('express');
const bcrypt = require('bcryptjs');
const store = require('./services/store');
const deviceState = require('./services/deviceState');
const incidentService = require('./services/incidentService');
const { SerialService, parseSerialLine } = require('./hardware/serialService');
const deviceController = require('./controllers/deviceController');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/incidents', require('./routes/incidents'));
app.use('/api/device', require('./routes/device'));
app.use('/api/health', require('./routes/health'));
app.use('/api/trains', require('./routes/trains'));
app.get('/', (req, res) => res.redirect('/staff.html'));
app.get('/api/ping', (req, res) => res.json({ ok: true, service: 'smartrail' }));

// USB node station: set NODE_STATION_NAME in .env to the station where
// the board actually sits (Mysuru / Mandya / Bengaluru). The SS for that
// station is the one who sees its incidents. Wi-Fi nodes report their
// own station in the ingest body instead.
const NODE_STATION = process.env.NODE_STATION_NAME || process.env.NODE_STATION_ID || 'Mysuru';
const NODE_SECTION = process.env.NODE_SECTION_ID || 'section-1';
async function onSerialEvent(ev) {
  try {
    if (ev.type === 'reading') deviceState.updateReading(ev.distanceCm, NODE_STATION, NODE_SECTION);
    else if (ev.type === 'gps') deviceState.updateGps(ev.latitude, ev.longitude, NODE_STATION, NODE_SECTION);
    else if (ev.type === 'gps_waiting') deviceState.markGpsWaiting(NODE_STATION, NODE_SECTION);
    else if (ev.type === 'obstacle') {
      deviceState.markObstacle(NODE_STATION, NODE_SECTION);
      const s = deviceState.getStatus(NODE_STATION);
      const distance = ev.distanceCm ?? s.lastDistanceCm;
      if (typeof distance === 'number' && distance > 0) {
        await incidentService.handleObstacle({
          distanceCm: distance, latitude: ev.latitude ?? s.latitude, longitude: ev.longitude ?? s.longitude,
          smsSent: false, source: 'serial', stationId: NODE_STATION, sectionId: NODE_SECTION,
          nearestStation: NODE_STATION,
        });
      }
    } else if (ev.type === 'ml') {
      // ML line forwarded by the Arduino over USB serial. NOTE: while
      // live_detection.py is running it OWNS the COM port (it is the
      // program talking to the Arduino), so in that setup the ML script
      // POSTs to /api/device/ingest itself and this branch only fires
      // when the server is the one holding the serial port.
      const { parseMl } = require('./services/ml');
      const ml = parseMl(ev.mlClass, ev.mlConfidence);
      console.log('[ml] %s @ %s (serial)', ev.mlClass, ev.mlConfidence);
      if (ml && ml.isObstacle) {
        deviceState.markObstacle(NODE_STATION, NODE_SECTION);
        const s = deviceState.getStatus(NODE_STATION);
        await incidentService.handleObstacle({
          distanceCm: s.lastDistanceCm ?? null, latitude: s.latitude, longitude: s.longitude,
          smsSent: false, source: 'ml', stationId: NODE_STATION, sectionId: NODE_SECTION,
          nearestStation: NODE_STATION, mlClass: ml.mlClass, mlConfidence: ml.mlConfidence,
        });
      } else if (ml) deviceState.markClear(NODE_STATION, NODE_SECTION);
    } else if (ev.type === 'clear') deviceState.markClear(NODE_STATION, NODE_SECTION);
    else if (ev.type === 'sms_sent') await incidentService.markSmsSentForLatestOpen(NODE_STATION);
    else if (ev.type === 'pong') deviceState.markPong(NODE_STATION, NODE_SECTION);
    else if (ev.type === 'buzzer_ack') deviceState.markBuzzer(ev.on, true, NODE_STATION, NODE_SECTION);
  } catch (err) {
    console.error('[serial] failed to handle event', ev, err.message);
  }
}
const serial = new SerialService(onSerialEvent);
deviceController.setSerial(serial);

// Seed ONLY if the users collection is empty. If your old smart-train-db
// is still there, this does not run and your old user_ids / passwords
// keep working — nothing is overwritten.
// Seed passwords are in README.md only, NOT printed on the login page.
// Change them before hosting, or set SEED_DEMO_USERS=false to skip seeding.
async function seed() {
  if (process.env.SEED_DEMO_USERS === 'false') return;
  if ((await store.countUsers()) === 0) {
    // Exactly 3 accounts (Nandan's structure, 2026-10-31):
    // one SS (Mysuru), one TI, one DOM. No other station SS accounts.
    const users = [
      { username: 'Mysuru Station Master', user_id: 'TGSMYS', password: 'Mysuru123!', department: 'StationMaster', station: 'Mysuru', designation: 'SS', sectionId: 'section-1' },
      { username: 'Traffic Inspector', user_id: 'TGSTI', password: 'Traffic123!', department: 'TrafficInspector', station: '', designation: 'TI', sectionId: 'section-1' },
      { username: 'Senior DOM', user_id: 'TGSDOM', password: 'DOM123!', department: 'RailwayAdmin', station: '', designation: 'DOM' },
    ];
    for (const u of users) {
      await store.createUser({ ...u, password: await bcrypt.hash(u.password, 10) });
    }
    console.log('[auth] Seeded users (TGSMYS = Mysuru SS / TGSTI = TI / TGSDOM = DOM) — CHANGE THESE PASSWORDS before real use.');
  }
  if ((await store.countTrains()) === 0) {
    await store.createTrain({ trainNumber: '12639', trainName: 'Brindavan SF Express', fromStation: 'MGR Chennai Central', toStation: 'KSR Bengaluru' });
    console.log('[trains] Seeded 12639 Brindavan SF Express.');
  }
}

async function main() {
  await store.connectDB(process.env.MONGO_URI);
  if (!store.isMongo()) {
    console.warn('[db] Running with in-memory storage. Install/run MongoDB and set MONGO_URI for real persistence.');
  }
  await seed();
  if (process.env.SIMULATE_DEVICE === 'true') {
    deviceState.setConnected(true);
    deviceState.updateReading(120, NODE_STATION, NODE_SECTION);
    await store.upsertHealthAlert({ station: NODE_STATION, sectionId: NODE_SECTION, status: 'online', deviceOnline: true, sensorOk: true, lastDistanceCm: 120, lastSeenAt: new Date(), message: 'Simulated node — track clear' });
    console.log('[device] SIMULATE_DEVICE=true — buzzer/ping are simulated, no hardware needed.');
  } else {
    serial.start();
  }
  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => console.log(`[smartrail] Dashboard: http://localhost:${port}/staff.html`));
}

if (require.main === module) main().catch((err) => { console.error(err); process.exit(1); });
module.exports = { app, parseSerialLine, onSerialEvent };
