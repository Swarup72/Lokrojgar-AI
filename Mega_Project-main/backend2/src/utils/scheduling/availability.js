import {
  addDaysToDateString,
  fromMinutes,
  isValidDateString,
  isValidTimeString,
  localToUtc,
  toMinutes,
  utcToLocalParts,
} from "./time.js";

/**
 * Pure availability rules. Nothing here touches the database.
 *
 * Precedence for one local date (documented API contract):
 *   1. A `block_day` exception removes everything for that date - recurring
 *      hours and one-time extra intervals alike.
 *   2. Otherwise: recurring weekly intervals for that weekday, plus any
 *      `extra` one-time intervals, minus every `block_range` exception.
 *   3. Active appointments (confirmed / unexpired pending) are subtracted last,
 *      by the caller, using the slot reservations - see scheduling.service.js.
 * An explicit block is never overridden by anything else.
 */

export const SCHEDULE_ERRORS = {
  INVALID_TIME: "AVAILABILITY_INVALID_TIME",
  END_BEFORE_START: "AVAILABILITY_END_BEFORE_START",
  OVERLAP: "AVAILABILITY_OVERLAP",
  INVALID_DAY: "AVAILABILITY_INVALID_DAY",
  OVERNIGHT: "AVAILABILITY_OVERNIGHT_NOT_SUPPORTED",
  EMPTY_INTERVAL: "AVAILABILITY_EMPTY_INTERVAL",
};

export class ScheduleValidationError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

/** Validates + normalizes a list of {start,end} "HH:mm" intervals (sorted). */
export function normalizeIntervals(intervals, label = "interval") {
  if (!Array.isArray(intervals)) {
    throw new ScheduleValidationError(SCHEDULE_ERRORS.EMPTY_INTERVAL, `${label}: intervals must be a list`);
  }
  const out = intervals.map((iv) => {
    if (!iv || !isValidTimeString(iv.start) || !isValidTimeString(iv.end)) {
      throw new ScheduleValidationError(SCHEDULE_ERRORS.INVALID_TIME, `${label}: times must be HH:mm (24-hour)`);
    }
    const s = toMinutes(iv.start);
    const e = toMinutes(iv.end);
    if (e === s) {
      throw new ScheduleValidationError(SCHEDULE_ERRORS.EMPTY_INTERVAL, `${label}: start and end are the same`);
    }
    if (e < s) {
      // Overnight is rejected rather than guessed at: "22:00-02:00" would
      // otherwise be silently read as an empty/invalid range.
      throw new ScheduleValidationError(
        SCHEDULE_ERRORS.OVERNIGHT,
        `${label}: overnight intervals are not supported; enter one interval per day`
      );
    }
    return { start: iv.start, end: iv.end };
  });
  out.sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
  for (let i = 1; i < out.length; i++) {
    if (toMinutes(out[i].start) < toMinutes(out[i - 1].end)) {
      throw new ScheduleValidationError(SCHEDULE_ERRORS.OVERLAP, `${label}: intervals overlap`);
    }
  }
  return out;
}

/**
 * weekly: [{ weekday: 1..7 (Mon..Sun), intervals: [{start,end}] }]. A weekday
 * that is absent or has no intervals is unavailable. Duplicates are rejected.
 */
export function normalizeWeekly(weekly) {
  if (!Array.isArray(weekly)) {
    throw new ScheduleValidationError(SCHEDULE_ERRORS.INVALID_DAY, "weekly must be a list of days");
  }
  const seen = new Set();
  const out = [];
  for (const day of weekly) {
    const wd = day?.weekday;
    if (!Number.isInteger(wd) || wd < 1 || wd > 7 || seen.has(wd)) {
      throw new ScheduleValidationError(SCHEDULE_ERRORS.INVALID_DAY, "weekday must be unique and 1 (Mon) to 7 (Sun)");
    }
    seen.add(wd);
    const intervals = normalizeIntervals(day.intervals ?? [], `weekday ${wd}`);
    out.push({ weekday: wd, intervals });
  }
  out.sort((a, b) => a.weekday - b.weekday);
  return out;
}

export function normalizeException(input) {
  const { date, type, start, end, reason } = input || {};
  if (!isValidDateString(date)) {
    throw new ScheduleValidationError(SCHEDULE_ERRORS.INVALID_TIME, "date must be a valid YYYY-MM-DD date");
  }
  if (!["block_day", "block_range", "extra"].includes(type)) {
    throw new ScheduleValidationError(SCHEDULE_ERRORS.INVALID_TIME, "type must be block_day, block_range or extra");
  }
  const cleanReason = typeof reason === "string" ? reason.replace(/<[^>]*>/g, "").trim().slice(0, 200) : "";
  if (type === "block_day") {
    return { date, type, start: null, end: null, reason: cleanReason };
  }
  const [iv] = normalizeIntervals([{ start, end }], `exception ${date}`);
  return { date, type, start: iv.start, end: iv.end, reason: cleanReason };
}

function mergeMinutes(list) {
  const sorted = list.map(([s, e]) => [s, e]).sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const [s, e] of sorted) {
    if (out.length && s <= out[out.length - 1][1]) out[out.length - 1][1] = Math.max(out[out.length - 1][1], e);
    else out.push([s, e]);
  }
  return out;
}

function subtractMinutes(base, cuts) {
  let result = base;
  for (const [cs, ce] of cuts) {
    const next = [];
    for (const [s, e] of result) {
      if (ce <= s || cs >= e) next.push([s, e]);
      else {
        if (cs > s) next.push([s, cs]);
        if (ce < e) next.push([ce, e]);
      }
    }
    result = next;
  }
  return result;
}

/**
 * Effective working intervals (minutes from local midnight) for one local date,
 * before appointments are considered.
 */
export function effectiveIntervalsForDate(dateStr, weekday, weekly, exceptions) {
  const dayExceptions = (exceptions || []).filter((x) => x.date === dateStr);
  if (dayExceptions.some((x) => x.type === "block_day")) return [];

  const recurring = (weekly || []).find((d) => d.weekday === weekday)?.intervals || [];
  const base = mergeMinutes([
    ...recurring.map((iv) => [toMinutes(iv.start), toMinutes(iv.end)]),
    ...dayExceptions.filter((x) => x.type === "extra").map((x) => [toMinutes(x.start), toMinutes(x.end)]),
  ]);
  const cuts = dayExceptions
    .filter((x) => x.type === "block_range")
    .map((x) => [toMinutes(x.start), toMinutes(x.end)]);
  return subtractMinutes(base, cuts);
}

/** ISO weekday (Mon=1..Sun=7) of a YYYY-MM-DD calendar date. */
export function weekdayOfDateString(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun
  return js === 0 ? 7 : js;
}

/**
 * Effective intervals for a date as UTC Dates. Local times that do not exist or
 * are ambiguous on a DST change are dropped (treated as unavailable).
 */
export function effectiveIntervalsUtc(dateStr, timeZone, weekly, exceptions) {
  const mins = effectiveIntervalsForDate(dateStr, weekdayOfDateString(dateStr), weekly, exceptions);
  const out = [];
  for (const [s, e] of mins) {
    const start = localToUtc(dateStr, s, timeZone);
    const end = localToUtc(dateStr, e, timeZone);
    if (start && end && end > start) out.push({ start, end });
  }
  return out;
}

/**
 * True when [startAt, endAt) lies fully inside ONE effective interval on the
 * worker's local date. An appointment crossing local midnight is never
 * accepted.
 */
export function isWithinAvailability({ startAt, endAt, timeZone, weekly, exceptions }) {
  const startLocal = utcToLocalParts(startAt, timeZone);
  const endLocal = utcToLocalParts(new Date(endAt.getTime() - 1), timeZone);
  if (startLocal.date !== endLocal.date) return false;
  return effectiveIntervalsUtc(startLocal.date, timeZone, weekly, exceptions).some(
    (iv) => iv.start <= startAt && iv.end >= endAt
  );
}

/** Every local date from..to inclusive. */
export function dateRange(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDaysToDateString(d, 1)) out.push(d);
  return out;
}

export { fromMinutes };
