import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_TIME_ZONE,
  fromMinutes,
  isSlotAligned,
  isValidDateString,
  isValidTimeString,
  isValidTimeZone,
  localToUtc,
  toMinutes,
  utcToLocalParts,
} from "../src/utils/scheduling/time.js";
import {
  SCHEDULE_ERRORS,
  ScheduleValidationError,
  effectiveIntervalsForDate,
  effectiveIntervalsUtc,
  isWithinAvailability,
  normalizeException,
  normalizeIntervals,
  normalizeWeekly,
  weekdayOfDateString,
} from "../src/utils/scheduling/availability.js";

test("time helpers: validate dates, times, IANA time zones, and IST conversions", () => {
  assert.equal(isValidTimeZone(DEFAULT_TIME_ZONE), true);
  assert.equal(isValidTimeZone("America/New_York"), true);
  assert.equal(isValidTimeZone("Invalid/Zone_Name"), false);

  assert.equal(isValidDateString("2027-02-28"), true);
  assert.equal(isValidDateString("2027-02-29"), false, "2027 is not a leap year");
  assert.equal(isValidDateString("2028-02-29"), true, "2028 is a leap year");
  assert.equal(isValidDateString("29-02-2028"), false);

  assert.equal(isValidTimeString("09:00"), true);
  assert.equal(isValidTimeString("23:45"), true);
  assert.equal(isValidTimeString("24:00"), false);
  assert.equal(isValidTimeString("9:00"), false);

  // 2027-03-15 09:00 IST == 2027-03-15T03:30:00.000Z
  const utc = localToUtc("2027-03-15", toMinutes("09:00"), "Asia/Kolkata");
  assert.equal(utc.toISOString(), "2027-03-15T03:30:00.000Z");
  assert.equal(isSlotAligned(utc), true);

  const parts = utcToLocalParts(utc, "Asia/Kolkata");
  assert.equal(parts.date, "2027-03-15");
  assert.equal(fromMinutes(parts.minutes), "09:00");
  assert.equal(parts.weekday, 1); // Monday
});

test("time helpers: DST spring-forward gap and fall-back overlap return null safely", () => {
  // US Eastern 2026-03-08 02:30 local does not exist (clocks jump 02:00 -> 03:00)
  assert.equal(localToUtc("2026-03-08", 2 * 60 + 30, "America/New_York"), null);
  // US Eastern 2026-11-01 01:30 local is ambiguous (occurs twice)
  assert.equal(localToUtc("2026-11-01", 1 * 60 + 30, "America/New_York"), null);
  // Normal day in US Eastern resolves cleanly
  assert.equal(
    localToUtc("2026-11-02", 9 * 60, "America/New_York").toISOString(),
    "2026-11-02T14:00:00.000Z"
  );
});

test("weekly schedule validation: multiple intervals, sorting, overlaps, and overnight rejection", () => {
  const valid = normalizeWeekly([
    {
      weekday: 1,
      intervals: [
        { start: "13:00", end: "18:00" },
        { start: "09:00", end: "12:00" },
      ],
    },
    { weekday: 2, intervals: [{ start: "10:00", end: "16:00" }] },
    { weekday: 3, intervals: [] }, // unavailable Wednesday
  ]);

  assert.equal(valid.length, 3);
  assert.deepEqual(valid[0].intervals, [
    { start: "09:00", end: "12:00" },
    { start: "13:00", end: "18:00" },
  ]);
  assert.deepEqual(valid[2].intervals, []);

  // Overlapping intervals rejected
  assert.throws(
    () =>
      normalizeIntervals([
        { start: "09:00", end: "13:00" },
        { start: "12:30", end: "15:00" },
      ]),
    (err) => err instanceof ScheduleValidationError && err.code === SCHEDULE_ERRORS.OVERLAP
  );

  // Overnight interval rejected with explicit code
  assert.throws(
    () => normalizeIntervals([{ start: "22:00", end: "02:00" }]),
    (err) => err instanceof ScheduleValidationError && err.code === SCHEDULE_ERRORS.OVERNIGHT
  );

  // Zero-length interval rejected
  assert.throws(
    () => normalizeIntervals([{ start: "10:00", end: "10:00" }]),
    (err) => err instanceof ScheduleValidationError && err.code === SCHEDULE_ERRORS.EMPTY_INTERVAL
  );
});

test("exception validation & precedence: block_day > block_range > extra + recurring", () => {
  const weekly = normalizeWeekly([
    {
      weekday: 1, // Monday
      intervals: [
        { start: "09:00", end: "12:00" },
        { start: "13:00", end: "18:00" },
      ],
    },
    {
      weekday: 7, // Sunday unavailable by default
      intervals: [],
    },
  ]);

  // 1. Recurring Monday with a partial block_range (10:00-11:00)
  const partialBlock = [
    normalizeException({
      date: "2027-03-15",
      type: "block_range",
      start: "10:00",
      end: "11:00",
      reason: "Doctor visit",
    }),
  ];
  const mondayIntervals = effectiveIntervalsForDate("2027-03-15", 1, weekly, partialBlock);
  assert.deepEqual(
    mondayIntervals.map(([s, e]) => [fromMinutes(s), fromMinutes(e)]),
    [
      ["09:00", "10:00"],
      ["11:00", "12:00"],
      ["13:00", "18:00"],
    ]
  );

  // 2. Full-day block overrides both recurring and any extra intervals on that date
  const fullDayBlock = [
    ...partialBlock,
    normalizeException({ date: "2027-03-15", type: "extra", start: "19:00", end: "21:00" }),
    normalizeException({ date: "2027-03-15", type: "block_day", reason: "Holiday" }),
  ];
  assert.deepEqual(effectiveIntervalsForDate("2027-03-15", 1, weekly, fullDayBlock), []);

  // 3. One-time extra availability on an otherwise unavailable Sunday (2027-03-21)
  const sundayExtra = [
    normalizeException({
      date: "2027-03-21",
      type: "extra",
      start: "10:00",
      end: "14:00",
      reason: "Weekend overtime",
    }),
    normalizeException({
      date: "2027-03-21",
      type: "block_range",
      start: "12:00",
      end: "12:30",
      reason: "Lunch break",
    }),
  ];
  assert.equal(weekdayOfDateString("2027-03-21"), 7);
  assert.deepEqual(
    effectiveIntervalsForDate("2027-03-21", 7, weekly, sundayExtra).map(([s, e]) => [
      fromMinutes(s),
      fromMinutes(e),
    ]),
    [
      ["10:00", "12:00"],
      ["12:30", "14:00"],
    ]
  );

  // 4. isWithinAvailability checks full containment of [startAt, endAt)
  const slotOkStart = localToUtc("2027-03-15", toMinutes("13:00"), "Asia/Kolkata");
  const slotOkEnd = localToUtc("2027-03-15", toMinutes("15:00"), "Asia/Kolkata");
  assert.equal(
    isWithinAvailability({
      startAt: slotOkStart,
      endAt: slotOkEnd,
      timeZone: "Asia/Kolkata",
      weekly,
      exceptions: partialBlock,
    }),
    true
  );

  // Extending past 18:00 (e.g. 17:00-18:30) is rejected
  const slotOverEnd = localToUtc("2027-03-15", toMinutes("17:00"), "Asia/Kolkata");
  const slotOverEndFinish = localToUtc("2027-03-15", toMinutes("18:30"), "Asia/Kolkata");
  assert.equal(
    isWithinAvailability({
      startAt: slotOverEnd,
      endAt: slotOverEndFinish,
      timeZone: "Asia/Kolkata",
      weekly,
      exceptions: partialBlock,
    }),
    false
  );
});

