/**
 * Pure calendar & availability calculation helpers for the frontend.
 * Zero external dependencies; uses standard Intl for locale-aware date/time formatting.
 */

export const SUPPORTED_DURATIONS = [15, 30, 45, 60, 90, 120];

const LOCALE_MAP = {
  en: "en-IN",
  hi: "hi-IN",
  mr: "mr-IN",
};

export function todayDateString(timeZone = "Asia/Kolkata", now = new Date()) {
  try {
    const parts = {};
    for (const p of new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now)) {
      parts[p.type] = p.value;
    }
    return `${parts.year}-${parts.month}-${parts.day}`;
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

export function addDays(dateStr, deltaDays) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return dt.toISOString().slice(0, 10);
}

export function addMonths(dateStr, deltaMonths) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 + deltaMonths, 1));
  const maxDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const target = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d, maxDay)));
  return target.toISOString().slice(0, 10);
}

/** ISO weekday: 1 (Mon) .. 7 (Sun). */
export function isoWeekday(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return js === 0 ? 7 : js;
}

/** Returns the 7 YYYY-MM-DD dates (Mon..Sun) of the week containing `dateStr`. */
export function buildWeekDates(dateStr) {
  const wd = isoWeekday(dateStr);
  const monday = addDays(dateStr, -(wd - 1));
  return Array.from({ length: 7 }, (_, idx) => addDays(monday, idx));
}

/**
 * Returns 42 day cells (6 weeks, Mon..Sun) covering the calendar month of `dateStr`.
 * Each cell is `{ date: "YYYY-MM-DD", dayNumber: number, inCurrentMonth: boolean }`.
 */
export function buildMonthGrid(dateStr) {
  const [y, m] = dateStr.split("-").map(Number);
  const firstOfMonth = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-01`;
  const firstWd = isoWeekday(firstOfMonth);
  const gridStart = addDays(firstOfMonth, -(firstWd - 1));
  const prefix = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}`;

  return Array.from({ length: 42 }, (_, idx) => {
    const cellDate = addDays(gridStart, idx);
    return {
      date: cellDate,
      dayNumber: Number(cellDate.slice(8, 10)),
      inCurrentMonth: cellDate.startsWith(prefix),
    };
  });
}

export function toMinutes(hhmm) {
  if (typeof hhmm !== "string" || !/^\d{2}:\d{2}$/.test(hhmm)) return NaN;
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function fromMinutes(mins) {
  const h = String(Math.floor(mins / 60)).padStart(2, "0");
  const m = String(mins % 60).padStart(2, "0");
  return `${h}:${m}`;
}

/**
 * Computes effective working intervals `[{start, end}]` for `dateStr` from a
 * worker's `{ weekly, exceptions }`, following the exact backend precedence:
 *   1. `block_day` -> `[]`
 *   2. `(weekly + extra) - block_range`
 */
export function computeDateWorkingIntervals(dateStr, weekly = [], exceptions = []) {
  const dayEx = (exceptions || []).filter((e) => e.date === dateStr);
  if (dayEx.some((e) => e.type === "block_day")) {
    return [];
  }
  const wd = isoWeekday(dateStr);
  const recurring = (weekly || []).find((d) => d.weekday === wd)?.intervals || [];
  const merged = [
    ...recurring.map((iv) => [toMinutes(iv.start), toMinutes(iv.end)]),
    ...dayEx.filter((e) => e.type === "extra").map((e) => [toMinutes(e.start), toMinutes(e.end)]),
  ]
    .filter(([s, e]) => Number.isFinite(s) && Number.isFinite(e) && e > s)
    .sort((a, b) => a[0] - b[0]);

  const coalesced = [];
  for (const [s, e] of merged) {
    if (coalesced.length && s <= coalesced[coalesced.length - 1][1]) {
      coalesced[coalesced.length - 1][1] = Math.max(coalesced[coalesced.length - 1][1], e);
    } else {
      coalesced.push([s, e]);
    }
  }

  let current = coalesced;
  const blocks = dayEx
    .filter((e) => e.type === "block_range")
    .map((e) => [toMinutes(e.start), toMinutes(e.end)])
    .filter(([s, e]) => Number.isFinite(s) && Number.isFinite(e) && e > s);

  for (const [bs, be] of blocks) {
    const next = [];
    for (const [s, e] of current) {
      if (be <= s || bs >= e) next.push([s, e]);
      else {
        if (bs > s) next.push([s, bs]);
        if (be < e) next.push([be, e]);
      }
    }
    current = next;
  }

  return current.map(([s, e]) => ({ start: fromMinutes(s), end: fromMinutes(e) }));
}

/**
 * Validates a day's interval array on the client. Returns null if valid or an
 * error code ("empty" | "overnight" | "overlap").
 */
export function validateDayIntervals(intervals = []) {
  const parsed = [];
  for (const iv of intervals) {
    const s = toMinutes(iv?.start);
    const e = toMinutes(iv?.end);
    if (!Number.isFinite(s) || !Number.isFinite(e) || s === e) return "empty";
    if (e < s) return "overnight";
    parsed.push([s, e]);
  }
  parsed.sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < parsed.length; i++) {
    if (parsed[i][0] < parsed[i - 1][1]) return "overlap";
  }
  return null;
}

export function calculateEndTimeIso(startAtIso, durationMinutes) {
  const start = new Date(startAtIso);
  if (Number.isNaN(start.getTime())) return null;
  const dur = Number(durationMinutes);
  if (!Number.isFinite(dur) || dur <= 0) return null;
  return new Date(start.getTime() + dur * 60_000).toISOString();
}

export function appointmentLocalDate(isoStr, timeZone = "Asia/Kolkata") {
  if (!isoStr) return "";
  const dt = new Date(isoStr);
  if (Number.isNaN(dt.getTime())) return "";
  return todayDateString(timeZone, dt);
}

export function formatMonthHeading(dateStr, language = "en") {
  const [y, m] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, 15));
  const locale = LOCALE_MAP[language] || "en-IN";
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(dt);
}

export function formatDisplayDate(dateStr, language = "en") {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr || "";
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const locale = LOCALE_MAP[language] || "en-IN";
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(dt);
}

export function formatTimeRange(startIso, endIso, language = "en", timeZone = "Asia/Kolkata") {
  if (!startIso || !endIso) return "";
  const s = new Date(startIso);
  const e = new Date(endIso);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return "";
  const locale = LOCALE_MAP[language] || "en-IN";
  const fmt = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  });
  return `${fmt.format(s)} – ${fmt.format(e)}`;
}

