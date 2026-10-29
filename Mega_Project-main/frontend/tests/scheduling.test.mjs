import test from "node:test";
import assert from "node:assert/strict";
import {
  SUPPORTED_DURATIONS,
  buildMonthGrid,
  buildWeekDates,
  computeDateWorkingIntervals,
  validateDayIntervals,
  calculateEndTimeIso,
} from "../src/utils/calendarHelpers.js";
import en from "../src/context/translations/en.js";
import hi from "../src/context/translations/hi.js";
import mr from "../src/context/translations/mr.js";

const LOCALES = { en, hi, mr };

let vite,
  React,
  renderToStaticMarkup,
  LanguageProvider,
  MemoryRouter,
  ScheduleCalendar,
  AppointmentCard,
  AppointmentBookingModal,
  WorkerCard;

test.before(async () => {
  globalThis.localStorage ??= {
    _store: new Map(),
    getItem(k) {
      return this._store.has(k) ? this._store.get(k) : null;
    },
    setItem(k, v) {
      this._store.set(k, String(v));
    },
    removeItem(k) {
      this._store.delete(k);
    },
  };
  const { createServer } = await import("vite");
  vite = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
    logLevel: "silent",
  });
  React = (await import("react")).default;
  ({ renderToStaticMarkup } = await import("react-dom/server"));
  ({ MemoryRouter } = await import("react-router-dom"));
  ({ LanguageProvider } = await vite.ssrLoadModule("/src/context/LanguageContext.jsx"));
  ({ ScheduleCalendar } = await vite.ssrLoadModule(
    "/src/components/scheduling/ScheduleCalendar.jsx"
  ));
  ({ AppointmentCard } = await vite.ssrLoadModule(
    "/src/components/scheduling/AppointmentCard.jsx"
  ));
  ({ AppointmentBookingModal } = await vite.ssrLoadModule(
    "/src/components/scheduling/AppointmentBookingModal.jsx"
  ));
  ({ WorkerCard } = await vite.ssrLoadModule(
    "/src/components/workers/WorkerCard.jsx"
  ));
});

test.after(async () => {
  await vite?.close();
});

const inLang = (lang, element) => {
  localStorage.setItem("lokrozgar.language", lang);
  return renderToStaticMarkup(
    React.createElement(MemoryRouter, null, React.createElement(LanguageProvider, null, element))
  );
};

test("calendarHelpers: buildMonthGrid produces 42 cells starting on Monday", () => {
  const grid = buildMonthGrid("2026-11-15");
  assert.equal(grid.length, 42);
  // Nov 1, 2026 is Sunday -> Monday of that week is Oct 26, 2026
  assert.equal(grid[0].date, "2026-10-26");
  assert.equal(grid[0].inCurrentMonth, false);
  const nov1 = grid.find((c) => c.date === "2026-11-01");
  assert.ok(nov1?.inCurrentMonth);
});

test("calendarHelpers: buildWeekDates returns 7 consecutive days Mon..Sun", () => {
  const week = buildWeekDates("2026-11-18"); // Wednesday
  assert.deepEqual(week, [
    "2026-11-16",
    "2026-11-17",
    "2026-11-18",
    "2026-11-19",
    "2026-11-20",
    "2026-11-21",
    "2026-11-22",
  ]);
});

test("calendarHelpers: computeDateWorkingIntervals respects block_day > block_range > weekly + extra", () => {
  const weekly = [{ weekday: 1, intervals: [{ start: "09:00", end: "17:00" }] }];
  // 2026-11-16 is Monday (weekday 1)
  assert.deepEqual(computeDateWorkingIntervals("2026-11-16", weekly, []), [
    { start: "09:00", end: "17:00" },
  ]);

  // Extra + block_range
  const withExceptions = computeDateWorkingIntervals("2026-11-16", weekly, [
    { date: "2026-11-16", type: "extra", start: "17:00", end: "19:00" },
    { date: "2026-11-16", type: "block_range", start: "12:00", end: "13:00" },
  ]);
  assert.deepEqual(withExceptions, [
    { start: "09:00", end: "12:00" },
    { start: "13:00", end: "19:00" },
  ]);

  // Full day block overrides all
  const blocked = computeDateWorkingIntervals("2026-11-16", weekly, [
    { date: "2026-11-16", type: "extra", start: "17:00", end: "19:00" },
    { date: "2026-11-16", type: "block_day" },
  ]);
  assert.deepEqual(blocked, []);
});

test("calendarHelpers: validateDayIntervals catches empty, overnight, and overlapping ranges", () => {
  assert.equal(validateDayIntervals([{ start: "09:00", end: "12:00" }, { start: "13:00", end: "17:00" }]), null);
  assert.equal(validateDayIntervals([{ start: "09:00", end: "09:00" }]), "empty");
  assert.equal(validateDayIntervals([{ start: "18:00", end: "09:00" }]), "overnight");
  assert.equal(
    validateDayIntervals([
      { start: "09:00", end: "13:00" },
      { start: "12:30", end: "15:00" },
    ]),
    "overlap"
  );
});

test("calendarHelpers: calculateEndTimeIso and supported durations", () => {
  assert.deepEqual(SUPPORTED_DURATIONS, [15, 30, 45, 60, 90, 120]);
  assert.equal(
    calculateEndTimeIso("2026-11-16T04:30:00.000Z", 45),
    "2026-11-16T05:15:00.000Z"
  );
});

test("ScheduleCalendar, AppointmentCard, AppointmentBookingModal, and WorkerCard render localized in en, hi, mr", () => {
  const sampleAppointment = {
    _id: "appt-1",
    workerId: { _id: "w-1", fullName: "Ramesh Patil", city: "Pune" },
    employerId: { _id: "e-1", businessName: "Shinde Builders", city: "Pune" },
    jobId: {
      _id: "j-1",
      title: {
        en: "Electrician Needed",
        hi: "इलेक्ट्रीशियन चाहिए",
        mr: "इलेक्ट्रिशियन हवा आहे",
      },
      city: "Pune",
    },
    startAt: "2026-11-16T04:30:00.000Z",
    endAt: "2026-11-16T05:30:00.000Z",
    durationMinutes: 60,
    timeZone: "Asia/Kolkata",
    purpose: "Wiring inspection",
    status: "pending",
  };

  for (const lang of ["en", "hi", "mr"]) {
    const calHtml = inLang(
      lang,
      React.createElement(ScheduleCalendar, {
        weekly: [{ weekday: 1, intervals: [{ start: "09:00", end: "18:00" }] }],
        exceptions: [{ _id: "ex-1", date: "2026-11-17", type: "block_day" }],
        appointments: [sampleAppointment],
        perspective: "worker",
      })
    );
    assert.ok(calHtml.includes(LOCALES[lang]["scheduling.viewMonth"]));
    assert.ok(calHtml.includes(LOCALES[lang]["scheduling.viewWeek"]));
    assert.ok(calHtml.includes(LOCALES[lang]["scheduling.viewAgenda"]));
    assert.doesNotMatch(calHtml, /undefined|NaN/);

    const cardHtml = inLang(
      lang,
      React.createElement(AppointmentCard, {
        appointment: sampleAppointment,
        perspective: "worker",
        onAccept: () => {},
        onReject: () => {},
        onCancel: () => {},
      })
    );
    assert.ok(cardHtml.includes(LOCALES[lang]["scheduling.acceptBtn"]));
    assert.ok(cardHtml.includes(LOCALES[lang]["scheduling.rejectBtn"]));
    assert.ok(cardHtml.includes("Shinde Builders"));

    const modalHtml = inLang(
      lang,
      React.createElement(AppointmentBookingModal, {
        worker: { _id: "w-1", fullName: "Ramesh Patil", city: "Pune" },
        jobId: "j-1",
        initialScheduleData: {
          timeZone: "Asia/Kolkata",
          days: [
            {
              date: "2026-11-16",
              workingIntervals: [{ start: "09:00", end: "18:00" }],
              bookableSlots: [
                {
                  startAt: "2026-11-16T04:30:00.000Z",
                  localTime: "10:00",
                  availableDurations: [15, 30, 45, 60, 90, 120],
                },
              ],
            },
          ],
        },
        onClose: () => {},
      })
    );
    assert.ok(modalHtml.includes(LOCALES[lang]["scheduling.selectDurationLabel"]));
    assert.ok(modalHtml.includes(LOCALES[lang]["scheduling.submitBookingBtn"]));
    assert.ok(modalHtml.includes("Ramesh Patil"));

    const workerCardHtml = inLang(
      lang,
      React.createElement(WorkerCard, {
        worker: { _id: "w-1", fullName: "Ramesh Patil", city: "Pune" },
        onBookAppointment: () => {},
      })
    );
    assert.ok(workerCardHtml.includes(LOCALES[lang]["scheduling.requestAppointmentBtn"]));
  }
});
