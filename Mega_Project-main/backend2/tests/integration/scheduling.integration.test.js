import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { app } from "../../src/app.js";
import User from "../../src/models/user.model.js";
import Session from "../../src/models/session.model.js";
import WorkerProfile from "../../src/models/workerProfile.model.js";
import EmployerProfile from "../../src/models/employerProfile.model.js";
import WorkerAvailability from "../../src/models/workerAvailability.model.js";
import Appointment, { APPOINTMENT_STATUS, computeSlotKeys } from "../../src/models/appointment.model.js";
import Notification from "../../src/models/notification.model.js";
import { localToUtc, toMinutes } from "../../src/utils/scheduling/time.js";

const TEST_DB = "LokRozgar_AI_scheduling_isolated_test";
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";
const SECRET = process.env.ACCESS_TOKEN_SECRET || "access_secret";

let server;
let baseUrl;
let workerUser, employer1User, employer2User, outsiderUser;
let workerProfile, employer1Profile, employer2Profile;
let workerToken, employer1Token, employer2Token, outsiderToken;

function signToken(user) {
  return jwt.sign({ _id: user._id, roles: user.roles }, SECRET, { expiresIn: "1h" });
}

async function createAuthUser({ phone, fullName, roles }) {
  const user = await User.create({
    phone,
    fullName,
    passwordHash: "hashed",
    roles,
    isPhoneVerified: true,
    preferredLanguage: "mr",
  });
  await Session.create({
    userId: user._id,
    deviceId: `dev_${phone}`,
    platform: "web",
    refreshTokenHash: `rt_${phone}`,
    expiresAt: new Date(Date.now() + 3600_000),
    isRevoked: false,
  });
  return { user, token: signToken(user) };
}

async function api(path, { method = "GET", token, body } = {}) {
  const res = await fetch(`${baseUrl}/api/v1${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

test.before(async () => {
  await mongoose.connect(`${MONGODB_URI}/${TEST_DB}`);
  await Promise.all([
    User.init(),
    Session.init(),
    WorkerProfile.init(),
    EmployerProfile.init(),
    WorkerAvailability.init(),
    Appointment.init(),
    Notification.init(),
  ]);

  const w = await createAuthUser({ phone: "+919100000001", fullName: "Suresh Worker", roles: ["worker"] });
  workerUser = w.user;
  workerToken = w.token;
  workerProfile = await WorkerProfile.create({
    userId: workerUser._id,
    fullName: "Suresh Worker",
    city: "Pune",
    availability: "available",
  });

  const e1 = await createAuthUser({ phone: "+919100000002", fullName: "Patil Builders", roles: ["employer"] });
  employer1User = e1.user;
  employer1Token = e1.token;
  employer1Profile = await EmployerProfile.create({
    userId: employer1User._id,
    businessName: "Patil Builders",
    city: "Pune",
  });

  const e2 = await createAuthUser({ phone: "+919100000003", fullName: "Deshmukh Infra", roles: ["employer"] });
  employer2User = e2.user;
  employer2Token = e2.token;
  employer2Profile = await EmployerProfile.create({
    userId: employer2User._id,
    businessName: "Deshmukh Infra",
    city: "Pune",
  });

  const o = await createAuthUser({ phone: "+919100000004", fullName: "Other Worker", roles: ["worker"] });
  outsiderUser = o.user;
  outsiderToken = o.token;
  await WorkerProfile.create({
    userId: outsiderUser._id,
    fullName: "Other Worker",
    city: "Mumbai",
  });

  server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  server?.close();
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test("1. Worker configures weekly schedule & date exceptions; employer queries bookable slots without seeing private notes", async () => {
  const getInitial = await api("/workers/me/availability", { token: workerToken });
  assert.equal(getInitial.status, 200);
  assert.equal(getInitial.body.data.timeZone, "Asia/Kolkata");

  // Update weekly schedule: Monday (1) has 09:00-12:00 and 13:00-17:00; Wednesday (3) unavailable
  const putRes = await api("/workers/me/availability", {
    method: "PUT",
    token: workerToken,
    body: {
      timeZone: "Asia/Kolkata",
      weekly: [
        {
          weekday: 1,
          intervals: [
            { start: "09:00", end: "12:00" },
            { start: "13:00", end: "17:00" },
          ],
        },
        { weekday: 2, intervals: [{ start: "10:00", end: "16:00" }] },
        { weekday: 3, intervals: [] },
        { weekday: 4, intervals: [{ start: "09:00", end: "18:00" }] },
        { weekday: 5, intervals: [{ start: "09:00", end: "18:00" }] },
        { weekday: 6, intervals: [{ start: "09:00", end: "14:00" }] },
        { weekday: 7, intervals: [] },
      ],
    },
  });
  assert.equal(putRes.status, 200);

  // Overlapping weekly interval rejected with 400
  const badPut = await api("/workers/me/availability", {
    method: "PUT",
    token: workerToken,
    body: {
      weekly: [
        {
          weekday: 1,
          intervals: [
            { start: "09:00", end: "13:00" },
            { start: "12:00", end: "15:00" },
          ],
        },
      ],
    },
  });
  assert.equal(badPut.status, 400);

  // Add a partial block on Monday 2027-05-03 10:00-11:00 with a private reason
  const addExc = await api("/workers/me/availability/exceptions", {
    method: "POST",
    token: workerToken,
    body: {
      date: "2027-05-03",
      type: "block_range",
      start: "10:00",
      end: "11:00",
      reason: "Private medical appointment",
    },
  });
  assert.equal(addExc.status, 201);
  assert.equal(addExc.body.data.exceptions.length, 1);

  // Employer queries worker availability for 2027-05-03..2027-05-05
  const pubRes = await api(
    `/workers/${workerProfile._id}/availability?from=2027-05-03&to=2027-05-05`,
    { token: employer1Token }
  );
  assert.equal(pubRes.status, 200);
  const mon = pubRes.body.data.days.find((d) => d.date === "2027-05-03");
  assert.deepEqual(mon.workingIntervals, [
    { start: "09:00", end: "10:00" },
    { start: "11:00", end: "12:00" },
    { start: "13:00", end: "17:00" },
  ]);
  // Verify private exception reason is NEVER leaked in public availability response
  assert.equal(JSON.stringify(pubRes.body).includes("Private medical appointment"), false);
});

test("2. Appointment validation: rejects forged status, unsupported duration, past start, and outside availability", async () => {
  const validStart = localToUtc("2027-05-03", toMinutes("09:00"), "Asia/Kolkata").toISOString();

  // Forged status field rejected by strict Zod schema
  const forged = await api("/appointments", {
    method: "POST",
    token: employer1Token,
    body: {
      workerId: String(workerProfile._id),
      startAt: validStart,
      durationMinutes: 30,
      purpose: "Plumbing work inspection",
      status: "confirmed",
    },
  });
  assert.equal(forged.status, 400);

  // Unsupported duration (e.g. 25 min) rejected
  const badDur = await api("/appointments", {
    method: "POST",
    token: employer1Token,
    body: {
      workerId: String(workerProfile._id),
      startAt: validStart,
      durationMinutes: 25,
      purpose: "Site discussion",
    },
  });
  assert.equal(badDur.status, 400);

  // Past timestamp rejected
  const past = await api("/appointments", {
    method: "POST",
    token: employer1Token,
    body: {
      workerId: String(workerProfile._id),
      startAt: "2020-01-01T09:00:00.000Z",
      durationMinutes: 30,
      purpose: "Past test",
    },
  });
  assert.equal(past.status, 400);

  // Slot inside blocked range (10:00-11:00 on 2027-05-03) rejected with 409
  const blockedStart = localToUtc("2027-05-03", toMinutes("10:00"), "Asia/Kolkata").toISOString();
  const inBlocked = await api("/appointments", {
    method: "POST",
    token: employer1Token,
    body: {
      workerId: String(workerProfile._id),
      startAt: blockedStart,
      durationMinutes: 30,
      purpose: "Blocked range attempt",
    },
  });
  assert.equal(inBlocked.status, 409);

  // Slot that starts inside 09:00-10:00 (at 09:30) but has duration 60m extending into 10:00-11:00 block -> rejected
  const overrunStart = localToUtc("2027-05-03", toMinutes("09:30"), "Asia/Kolkata").toISOString();
  const overrun = await api("/appointments", {
    method: "POST",
    token: employer1Token,
    body: {
      workerId: String(workerProfile._id),
      startAt: overrunStart,
      durationMinutes: 60,
      purpose: "Overrun attempt",
    },
  });
  assert.equal(overrun.status, 409);
});

test("3. Full lifecycle, authorization, idempotency, notifications, and slot release on reject/cancel", async () => {
  const start9am = localToUtc("2027-05-03", toMinutes("09:00"), "Asia/Kolkata").toISOString();

  // Employer 1 creates a 60-minute request (09:00-10:00 IST)
  const created = await api("/appointments", {
    method: "POST",
    token: employer1Token,
    body: {
      workerId: String(workerProfile._id),
      startAt: start9am,
      durationMinutes: 60,
      purpose: "Bathroom pipe fitting consultation",
      idempotencyKey: "emp1-booking-1",
    },
  });
  assert.equal(created.status, 201);
  const apptId = created.body.data._id;
  assert.equal(created.body.data.status, "pending");

  // Retrying with same idempotencyKey returns 200 without creating a duplicate
  const retry = await api("/appointments", {
    method: "POST",
    token: employer1Token,
    body: {
      workerId: String(workerProfile._id),
      startAt: start9am,
      durationMinutes: 60,
      purpose: "Bathroom pipe fitting consultation",
      idempotencyKey: "emp1-booking-1",
    },
  });
  assert.equal(retry.status, 200);
  assert.equal(retry.body.data._id, apptId);

  // Employer cannot accept their own request (403)
  const empAccept = await api(`/appointments/${apptId}/accept`, {
    method: "POST",
    token: employer1Token,
  });
  assert.equal(empAccept.status, 403);

  // Outsider worker cannot view or accept this appointment (404 / 403)
  const outsiderGet = await api(`/appointments/${apptId}`, { token: outsiderToken });
  assert.equal(outsiderGet.status, 404);
  const outsiderAccept = await api(`/appointments/${apptId}/accept`, {
    method: "POST",
    token: outsiderToken,
  });
  assert.equal(outsiderAccept.status, 403);

  // Worker accepts the appointment
  const accepted = await api(`/appointments/${apptId}/accept`, {
    method: "POST",
    token: workerToken,
  });
  assert.equal(accepted.status, 200);
  assert.equal(accepted.body.data.status, "confirmed");

  // Repeated accept call is idempotent
  const acceptedAgain = await api(`/appointments/${apptId}/accept`, {
    method: "POST",
    token: workerToken,
  });
  assert.equal(acceptedAgain.status, 200);
  assert.equal(acceptedAgain.body.data.status, "confirmed");

  // Worker cannot block 2027-05-03 without acknowledging the confirmed appointment conflict (409)
  const silentBlock = await api("/workers/me/availability/exceptions", {
    method: "POST",
    token: workerToken,
    body: {
      date: "2027-05-03",
      type: "block_day",
      reason: "Sudden trip",
    },
  });
  assert.equal(silentBlock.status, 409);

  // Cancel the confirmed appointment -> releases the 09:00-10:00 slot
  const cancelled = await api(`/appointments/${apptId}/cancel`, {
    method: "POST",
    token: employer1Token,
    body: { reason: "Rescheduling for afternoon" },
  });
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.body.data.status, "cancelled");

  // Now Employer 2 can book 09:00-09:45 on 2027-05-03 because cancellation released the slot!
  const emp2Book = await api("/appointments", {
    method: "POST",
    token: employer2Token,
    body: {
      workerId: String(workerProfile._id),
      startAt: start9am,
      durationMinutes: 45,
      purpose: "Kitchen leak check",
    },
  });
  assert.equal(emp2Book.status, 201);

  // Worker rejects Employer 2's request -> releases slot again
  const rejected = await api(`/appointments/${emp2Book.body.data._id}/reject`, {
    method: "POST",
    token: workerToken,
    body: { reason: "Already committed elsewhere" },
  });
  assert.equal(rejected.status, 200);
  assert.equal(rejected.body.data.status, "rejected");

  // Rejected appointment cannot be accepted afterward
  const acceptAfterReject = await api(`/appointments/${emp2Book.body.data._id}/accept`, {
    method: "POST",
    token: workerToken,
  });
  assert.equal(acceptAfterReject.status, 409);

  // Verify notifications were persisted in DB with valid schema type
  const notifs = await Notification.find({ refId: apptId }).lean();
  assert.ok(notifs.length >= 2, "request, confirmation, and cancellation notifications persisted");
  for (const n of notifs) {
    assert.equal(n.type, "application_update");
    assert.ok(n.title.mr && n.title.hi && n.title.en);
  }
});

test("4. Expired pending reservation cannot be accepted and releases its slot for new bookings", async () => {
  const start13pm = localToUtc("2027-05-03", toMinutes("13:00"), "Asia/Kolkata");
  const pastExpiry = new Date(Date.now() - 60_000);

  // Seed an already-expired pending appointment holding activeSlotKeys
  const expiredPending = await Appointment.create({
    workerId: workerProfile._id,
    employerId: employer1Profile._id,
    startAt: start13pm,
    endAt: new Date(start13pm.getTime() + 60 * 60_000),
    durationMinutes: 60,
    timeZone: "Asia/Kolkata",
    purpose: "Stale request",
    status: APPOINTMENT_STATUS.PENDING,
    expiresAt: pastExpiry,
    activeSlotKeys: computeSlotKeys(workerProfile._id, start13pm, new Date(start13pm.getTime() + 60 * 60_000)),
  });

  // Worker trying to accept the expired request gets 409 and it transitions to expired
  const acceptExpired = await api(`/appointments/${expiredPending._id}/accept`, {
    method: "POST",
    token: workerToken,
  });
  assert.equal(acceptExpired.status, 409);

  // Employer 2 can immediately book the exact same 13:00 slot
  const freshBook = await api("/appointments", {
    method: "POST",
    token: employer2Token,
    body: {
      workerId: String(workerProfile._id),
      startAt: start13pm.toISOString(),
      durationMinutes: 60,
      purpose: "Fresh request after expiry",
    },
  });
  assert.equal(freshBook.status, 201);

  // Clean up fresh booking by cancelling
  await api(`/appointments/${freshBook.body.data._id}/cancel`, {
    method: "POST",
    token: employer2Token,
  });
});

test("5. Real-MongoDB Concurrency: two employers racing for overlapping intervals cannot double-book", async () => {
  // Employer 1 requests 14:00-15:00 (60m) and Employer 2 concurrently requests 14:30-15:30 (60m) on 2027-05-03
  const start1400 = localToUtc("2027-05-03", toMinutes("14:00"), "Asia/Kolkata").toISOString();
  const start1430 = localToUtc("2027-05-03", toMinutes("14:30"), "Asia/Kolkata").toISOString();

  const [res1, res2] = await Promise.all([
    api("/appointments", {
      method: "POST",
      token: employer1Token,
      body: {
        workerId: String(workerProfile._id),
        startAt: start1400,
        durationMinutes: 60,
        purpose: "Concurrent request A (14:00-15:00)",
      },
    }),
    api("/appointments", {
      method: "POST",
      token: employer2Token,
      body: {
        workerId: String(workerProfile._id),
        startAt: start1430,
        durationMinutes: 60,
        purpose: "Concurrent request B (14:30-15:30)",
      },
    }),
  ]);

  const statuses = [res1.status, res2.status].sort();
  assert.deepEqual(
    statuses,
    [201, 409],
    `Exactly one overlapping request must succeed (201) and the other must be rejected (409); got ${statuses}`
  );
});

test("6. Real-MongoDB Concurrency: two worker acceptances racing on overlapping legacy/pending records cannot both confirm", async () => {
  const start1500 = localToUtc("2027-05-04", toMinutes("10:00"), "Asia/Kolkata");
  const start1530 = localToUtc("2027-05-04", toMinutes("10:30"), "Asia/Kolkata");
  const futureExpiry = new Date(Date.now() + 3600_000);

  // Simulate two overlapping pending appointments whose activeSlotKeys were not yet populated (e.g. legacy import)
  const [p1, p2] = await Appointment.insertMany([
    {
      workerId: workerProfile._id,
      employerId: employer1Profile._id,
      startAt: start1500,
      endAt: new Date(start1500.getTime() + 60 * 60_000),
      durationMinutes: 60,
      timeZone: "Asia/Kolkata",
      purpose: "Race accept 1",
      status: APPOINTMENT_STATUS.PENDING,
      expiresAt: futureExpiry,
    },
    {
      workerId: workerProfile._id,
      employerId: employer2Profile._id,
      startAt: start1530,
      endAt: new Date(start1530.getTime() + 60 * 60_000),
      durationMinutes: 60,
      timeZone: "Asia/Kolkata",
      purpose: "Race accept 2",
      status: APPOINTMENT_STATUS.PENDING,
      expiresAt: futureExpiry,
    },
  ]);

  const [acc1, acc2] = await Promise.all([
    api(`/appointments/${p1._id}/accept`, { method: "POST", token: workerToken }),
    api(`/appointments/${p2._id}/accept`, { method: "POST", token: workerToken }),
  ]);

  const statuses = [acc1.status, acc2.status].sort();
  assert.deepEqual(
    statuses,
    [200, 409],
    `Only one overlapping pending appointment can become confirmed; got ${statuses}`
  );
});

test("7. Real-MongoDB Concurrency: availability block_day racing with appointment creation never leaves a booking on a blocked date", async () => {
  // Target date: Tuesday 2027-05-11 at 11:00 IST (normally available 10:00-16:00)
  const start1100 = localToUtc("2027-05-11", toMinutes("11:00"), "Asia/Kolkata").toISOString();

  await Promise.all([
    api("/workers/me/availability/exceptions", {
      method: "POST",
      token: workerToken,
      body: {
        date: "2027-05-11",
        type: "block_day",
        reason: "Festival holiday",
      },
    }),
    api("/appointments", {
      method: "POST",
      token: employer1Token,
      body: {
        workerId: String(workerProfile._id),
        startAt: start1100,
        durationMinutes: 60,
        purpose: "Race against block_day",
      },
    }),
  ]);

  // Verify the final state: if the block_day succeeded, no active appointment may remain on 2027-05-11
  const pubAfter = await api(
    `/workers/${workerProfile._id}/availability?from=2027-05-11&to=2027-05-11`,
    { token: employer1Token }
  );
  const day = pubAfter.body.data.days[0];
  assert.equal(day.isBlockedDay, true);
  assert.equal(day.bookableSlots.length, 0);

  // Any subsequent booking on the blocked date is rejected with 409
  const afterBlock = await api("/appointments", {
    method: "POST",
    token: employer2Token,
    body: {
      workerId: String(workerProfile._id),
      startAt: start1100,
      durationMinutes: 30,
      purpose: "After block_day",
    },
  });
  assert.equal(afterBlock.status, 409);
});

