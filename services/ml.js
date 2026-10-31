/**
 * ML camera classification mapping (live_detection.py, 2026-10-31).
 *
 * The Python ML script predicts one of these classes every ~10 frames
 * and sends `ML,<class>,<confidence>` to the Arduino, and (in the
 * updated copy) POSTs the same result to /api/device/ingest:
 *
 *   "Animals on track"    -> obstacle, dashboard type Animal
 *   "Human on track"      -> obstacle, dashboard type Human
 *   "Vehicles on track"   -> obstacle, dashboard type Vehicle
 *   "Obstacles on track"  -> obstacle, dashboard type Other
 *   "Clear track"         -> NOT an obstacle
 *   "UNKNOWN"             -> below the 0.60 confidence threshold in the
 *                            Python script — never creates an incident
 *
 * The ML class is a machine detection. It is stored on the incident as
 * mlClass/mlConfidence and shown on the dashboard as "ML detected: …".
 * It does NOT replace the SS assessment (assessmentDetails) — the SS
 * still confirms what the obstacle actually is.
 */
const ML_CLASSES = {
  'animals on track': { obstacle: true, type: 'Animal' },
  'human on track': { obstacle: true, type: 'Human' },
  'vehicles on track': { obstacle: true, type: 'Vehicle' },
  'obstacles on track': { obstacle: true, type: 'Other' },
  'clear track': { obstacle: false, type: null },
  'unknown': { obstacle: false, type: null },
  'unknown / recheck': { obstacle: false, type: null },
};

function parseMl(rawClass, rawConfidence) {
  if (rawClass == null || String(rawClass).trim() === '') return null;
  const label = String(rawClass).trim();
  const info = ML_CLASSES[label.toLowerCase()];
  if (!info) return null; // unrecognised label — ignore, do not guess
  let confidence = null;
  if (rawConfidence != null && rawConfidence !== '') {
    const n = Number(rawConfidence);
    if (Number.isFinite(n)) confidence = n > 1 ? n / 100 : n; // accept 87 or 0.87
  }
  return { mlClass: label, mlConfidence: confidence, isObstacle: info.obstacle, mlType: info.type };
}

module.exports = { parseMl, ML_CLASSES };
