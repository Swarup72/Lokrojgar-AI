/**
 * Time helpers for scheduling. No external date library: the only primitive
 * needed is "what is the UTC offset of IANA zone Z at instant T", which Intl
 * provides, and from it a DST-safe local<->UTC conversion.
 *
 * Canonical storage is always a UTC instant (Date). A zone name is stored next
 * to anything defined in local wall-clock terms (weekly hours, exceptions).
 */

export const DEFAULT_TIME_ZONE = "Asia/Kolkata";
export const SLOT_MINUTES = 15;
export const SLOT_MS = SLOT_MINUTES * 60 * 1000;

const dtfCache = new Map();

function formatter(timeZone) {
  let f = dtfCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    });
    dtfCache.set(timeZone, f);
  }
  return f;
}

export function isValidTimeZone(timeZone) {
  if (typeof timeZone !== "string" || !timeZone) return false;
  try {
    formatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

const WEEKDAY_ISO = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/** Wall-clock parts of a UTC instant in `timeZone`. weekday is ISO (Mon=1..Sun=7). */
export function utcToLocalParts(date, timeZone) {
  const parts = {};
  for (const p of formatter(timeZone).formatToParts(date)) parts[p.type] = p.value;
  const hour = Number(parts.hour) % 24;
  const minute = Number(parts.minute);
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour,
    minute,
    minutes: hour * 60 + minute,
    weekday: WEEKDAY_ISO[parts.weekday],
  };
}

/** Offset (ms) such that local = utc + offset, at instant `ms`. */
function offsetMs(ms, timeZone) {
  const p = formatter(timeZone).formatToParts(new Date(ms));
  const o = {};
  for (const x of p) o[x.type] = x.value;
  const asUtc = Date.UTC(
    Number(o.year),
    Number(o.month) - 1,
    Number(o.day),
    Number(o.hour) % 24,
    Number(o.minute),
    Number(o.second)
  );
  return asUtc - Math.floor(ms / 1000) * 1000;
}

export function isValidDateString(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function isValidTimeString(value) {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function toMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function fromMinutes(minutes) {
  const h = String(Math.floor(minutes / 60)).padStart(2, "0");
  const m = String(minutes % 60).padStart(2, "0");
  return `${h}:${m}`;
}

export function addDaysToDateString(dateStr, days) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/**
 * Local wall-clock (date + minutes-from-midnight) in `timeZone` -> UTC Date.
 * Returns null for a local time that does not exist (spring-forward gap) and
 * for one that occurs twice (fall-back overlap): neither can be resolved
 * safely, so callers treat them as "not available" instead of guessing.
 * `minutes` may be 1440 (end of day).
 */
export function localToUtc(dateStr, minutes, timeZone) {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const wallMs = Date.UTC(y, mo - 1, d, 0, minutes, 0);
  const candidates = new Set();
  for (const probe of [wallMs - 36e5 * 24, wallMs, wallMs + 36e5 * 24]) {
    const utc = wallMs - offsetMs(probe, timeZone);
    if (offsetMs(utc, timeZone) + utc === wallMs) candidates.add(utc);
  }
  if (candidates.size !== 1) return null;
  return new Date([...candidates][0]);
}

export function floorToSlot(ms) {
  return Math.floor(ms / SLOT_MS) * SLOT_MS;
}

export function isSlotAligned(date) {
  return date.getTime() % SLOT_MS === 0;
}
