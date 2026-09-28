// Place coordinates (!3d / !4d), not the Google Maps viewport center.
export const attendanceOffice = { latitude: 16.4716921, longitude: 99.5139851, radiusMeters: 3, mapsUrl: "https://maps.app.goo.gl/21tL5xbWrhzb7aHSA" } as const;

export function officeDistanceMeters(latitude: number, longitude: number) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const a = Math.sin(radians(latitude - attendanceOffice.latitude) / 2) ** 2
    + Math.cos(radians(latitude)) * Math.cos(radians(attendanceOffice.latitude)) * Math.sin(radians(longitude - attendanceOffice.longitude) / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, a))));
}

export function isInsideAttendanceOffice(latitude: number, longitude: number) {
  return Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 && officeDistanceMeters(latitude, longitude) <= attendanceOffice.radiusMeters;
}

export function attendanceTime(now = new Date()) {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
  return { day, time, minutesLate: Math.max(0, Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) - 540) };
}

export function validAttendanceLocation(lat: number, lng: number, accuracy: number, capturedAt: number, now = Date.now()) {
  return [lat, lng, accuracy, capturedAt].every(Number.isFinite) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && accuracy >= 0 && accuracy <= 100000 && capturedAt <= now + 10000 && now - capturedAt <= 120000;
}

export async function ensureAttendanceEvidence(db: D1Database) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS attendance_capture_evidence (
    id TEXT PRIMARY KEY NOT NULL, employee_id TEXT NOT NULL, work_date TEXT NOT NULL,
    kind TEXT NOT NULL CHECK(kind IN ('in','out')), recorded_at TEXT NOT NULL,
    latitude REAL NOT NULL, longitude REAL NOT NULL, accuracy REAL NOT NULL,
    photo_key TEXT NOT NULL, UNIQUE(employee_id,work_date,kind)
  )`).run();
}
