/**
 * Serial link to the Arduino/ESP32 node.
 *
 * Parses BOTH the original firmware's human-readable lines (from
 * 1stFinal.ino) and the machine-readable lines added by the updated
 * firmware/smartrail_node.ino, so the old code works without reflashing:
 *
 *   Distance: 7 cm
 *   Lat: 12.345678 | Lng: 78.123456
 *   GPS: waiting for fix...
 *   !!! OBSTACLE DETECTED !!!
 *   Track clear.
 *   [GSM] SMS Sent!        /  SMS Sent!
 *   EVENT:OBSTACLE distance=7 lat=.. lng=..
 *   EVENT:SMS_SENT
 *   PONG
 *   BUZZER:ON_OK / BUZZER:OFF_OK
 *
 * `serialport` is an optional dependency: if it is not installed, or no
 * SERIAL_PORT is set, the service stays offline and the HTTP ingest route
 * (x-device-key) is the way data gets in. That keeps `npm start` working
 * on a laptop with no hardware attached.
 */
function parseSerialLine(rawLine) {
  const line = String(rawLine || '').trim();
  if (!line) return null;

  // JSON lines from the updated firmware, e.g. {"type":"reading","distance":7}
  if (line.startsWith('{')) {
    try {
      const j = JSON.parse(line);
      if (j.type === 'reading' && typeof j.distance === 'number') return { type: 'reading', distanceCm: j.distance };
      if (j.type === 'gps') return { type: 'gps', latitude: j.lat ?? j.latitude ?? null, longitude: j.lng ?? j.longitude ?? null };
      if (j.type === 'obstacle') return { type: 'obstacle', distanceCm: j.distance ?? null, latitude: j.lat ?? null, longitude: j.lng ?? null };
      if (j.type === 'clear') return { type: 'clear' };
      if (j.type === 'sms_sent') return { type: 'sms_sent' };
      if (j.type === 'pong') return { type: 'pong' };
    } catch { /* fall through to text parsing */ }
  }

  // ML lines from live_detection.py, forwarded/echoed by the Arduino:
  //   ML,Human on track,0.87   /   ML,UNKNOWN,0.42   /   ML,Clear track,0.98
  m = line.match(/^ML,([^,]+),(\d+(?:\.\d+)?)/i);
  if (m) return { type: 'ml', mlClass: m[1].trim(), mlConfidence: Number(m[2]) };

  m = line.match(/^Distance:\s*(-?\d+)\s*cm/i);
  if (m) return { type: 'reading', distanceCm: Number(m[1]) };

  m = line.match(/^Lat:\s*(-?\d+(?:\.\d+)?)\s*\|\s*Lng:\s*(-?\d+(?:\.\d+)?)/i);
  if (m) return { type: 'gps', latitude: Number(m[1]), longitude: Number(m[2]) };

  if (/^GPS:\s*waiting/i.test(line)) return { type: 'gps_waiting' };
  if (/OBSTACLE DETECTED/i.test(line)) return { type: 'obstacle' };
  if (/^Track clear/i.test(line)) return { type: 'clear' };
  if (/SMS Sent/i.test(line)) return { type: 'sms_sent' };
  if (/^EVENT:OBSTACLE/i.test(line)) {
    const d = line.match(/distance=(-?\d+)/i);
    const la = line.match(/lat=(-?\d+(?:\.\d+)?)/i);
    const lo = line.match(/lng=(-?\d+(?:\.\d+)?)/i);
    return { type: 'obstacle', distanceCm: d ? Number(d[1]) : null, latitude: la ? Number(la[1]) : null, longitude: lo ? Number(lo[1]) : null };
  }
  if (/^EVENT:SMS_SENT/i.test(line)) return { type: 'sms_sent' };
  if (/^PONG\b/i.test(line)) return { type: 'pong' };
  m = line.match(/^BUZZER:(ON|OFF)_OK/i);
  if (m) return { type: 'buzzer_ack', on: m[1] === 'ON' };
  return null; // AT chatter, "SmartRail ready", etc. — ignore, do not crash
}

class SerialService {
  constructor(onEvent) { this.onEvent = onEvent; this.port = null; this.connected = false; }
  isConnected() { return this.connected; }

  start() {
    const portPath = process.env.SERIAL_PORT;
    if (!portPath) { console.log('[serial] SERIAL_PORT not set — running without USB hardware (use HTTP ingest).'); return; }
    let SerialPort, ReadlineParser;
    try {
      ({ SerialPort } = require('serialport'));
      ({ ReadlineParser } = require('@serialport/parser-readline'));
    } catch {
      console.warn('[serial] serialport not installed — run `npm install serialport` and restart to use USB. Running without hardware for now.');
      return;
    }
    const baud = Number(process.env.SERIAL_BAUD || 115200);
    this.port = new SerialPort({ path: portPath, baudRate: baud, autoOpen: false });
    const parser = this.port.pipe(new ReadlineParser({ delimiter: '\n' }));
    parser.on('data', (line) => {
      const ev = parseSerialLine(line);
      if (ev) this.onEvent(ev, line);
    });
    this.port.on('error', (err) => { console.error('[serial] error:', err.message); this.connected = false; });
    this.port.on('close', () => { console.log('[serial] port closed'); this.connected = false; });
    this.port.open((err) => {
      if (err) { console.error('[serial] could not open %s: %s', portPath, err.message); return; }
      this.connected = true;
      console.log('[serial] connected to %s at %d baud', portPath, baud);
    });
  }

  sendCommand(cmd) {
    if (this.port && this.connected) { this.port.write(`${cmd}\n`); return true; }
    return false;
  }
}

module.exports = { parseSerialLine, SerialService };
