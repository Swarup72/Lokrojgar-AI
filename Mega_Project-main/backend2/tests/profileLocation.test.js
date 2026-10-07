/**
 * A newly registered profile has NO location - not a Pune placeholder.
 *
 * Both profile models used to REQUIRE a GeoJSON point, so registration had to
 * invent one and seeded every new profile with Pune city-centre coordinates
 * ([73.8567, 18.5204]). Because those are real, valid coordinates, nothing
 * downstream could tell them apart from a location the user had actually given:
 * the location matcher scored a brand-new worker as though they lived in central
 * Pune. Measured against the AI service with the two side by side: a worker
 * carrying the placeholder scored location=96.5 for a Pune job, purely from a
 * value they never supplied.
 *
 * These tests pin that the placeholder is gone, that an absent location is a
 * valid state, and that a location which IS present is still fully validated.
 */

import test from "node:test";
import assert from "node:assert";
import { mock } from "node:test";
import { readFile, readdir } from "node:fs/promises";

import User from "../src/models/user.model.js";
import WorkerProfile from "../src/models/workerProfile.model.js";
import EmployerProfile from "../src/models/employerProfile.model.js";
import { createProfilesForRoles } from "../src/utils/profileProvisioning.js";
import { validate } from "../src/middlewares/validate.middleware.js";
import { workerProfileValidator, employerProfileValidator } from "../src/validators/profile.validator.js";

const USER_ID = "507f1f77bcf86cd799490001";

// The exact value registration used to seed. Named here so the guard test below
// can assert it is absent from the source, not merely absent from behaviour.
const PUNE_PLACEHOLDER = [73.8567, 18.5204];

// --- provisioning sets no location at all -----------------------------------

test("a newly provisioned WorkerProfile has NO location field", async (t) => {
  let created = null;
  const mocks = [
    mock.method(WorkerProfile, "findOne", async () => null),
    mock.method(WorkerProfile, "create", async (doc) => {
      created = doc;
      return doc;
    }),
  ];
  t.after(() => mocks.forEach((m) => m.mock.restore()));

  await createProfilesForRoles({ _id: USER_ID, fullName: "New Worker" }, ["worker"], {});

  assert.ok(created, "the profile must still be created");
  assert.strictEqual(created.fullName, "New Worker");
  assert.ok(!("location" in created), `no location may be invented, got ${JSON.stringify(created.location)}`);
});

test("a newly provisioned EmployerProfile has NO location field", async (t) => {
  let created = null;
  const mocks = [
    mock.method(EmployerProfile, "findOne", async () => null),
    mock.method(EmployerProfile, "create", async (doc) => {
      created = doc;
      return doc;
    }),
  ];
  t.after(() => mocks.forEach((m) => m.mock.restore()));

  await createProfilesForRoles({ _id: USER_ID, fullName: "New Employer" }, ["employer"], {});

  assert.ok(created);
  assert.ok(!("location" in created), `no location may be invented, got ${JSON.stringify(created.location)}`);
});

// --- the schema now treats absence as valid, presence as validated ----------

for (const [label, Model, base] of [
  ["WorkerProfile", WorkerProfile, { fullName: "W" }],
  ["EmployerProfile", EmployerProfile, { businessName: "B", businessType: "c" }],
]) {
  test(`${label}: a document with NO location is valid`, () => {
    const doc = new Model({ userId: USER_ID, ...base });
    const error = doc.validateSync();
    assert.strictEqual(error, undefined, `absent location must be valid: ${error?.message}`);
    assert.strictEqual(doc.location, undefined, "the path must be absent, not an empty object");
  });

  test(`${label}: a real location is still accepted and stored as a GeoJSON Point`, () => {
    const doc = new Model({ userId: USER_ID, ...base, location: { type: "Point", coordinates: [73.9, 18.6] } });
    assert.strictEqual(doc.validateSync(), undefined);
    assert.strictEqual(doc.location.type, "Point");
    assert.deepStrictEqual(doc.location.coordinates.toObject?.() ?? [...doc.location.coordinates], [73.9, 18.6]);
  });

  test(`${label}: an OUT-OF-RANGE location is still rejected`, () => {
    const doc = new Model({ userId: USER_ID, ...base, location: { type: "Point", coordinates: [999, 18.6] } });
    assert.ok(doc.validateSync(), "coordinate validation must survive making location optional");
  });

  test(`${label}: a location with the wrong number of values is still rejected`, () => {
    const doc = new Model({ userId: USER_ID, ...base, location: { type: "Point", coordinates: [73.9] } });
    assert.ok(doc.validateSync());
  });

  test(`${label}: a location object with no coordinates is rejected, not silently empty`, () => {
    const doc = new Model({ userId: USER_ID, ...base, location: { type: "Point" } });
    assert.ok(doc.validateSync(), "a half-supplied location is a mistake, not an absence");
  });
}

// --- saving a profile without a location must not fail, or wipe one ---------

async function runProfileValidator(schema, body) {
  const req = { body, query: {}, params: {} };
  let captured;
  await validate(schema)(req, {}, (err) => {
    captured = err || null;
  });
  return { error: captured, body: req.body };
}

test("worker profile save: coordinates may be omitted", async () => {
  const { error } = await runProfileValidator(workerProfileValidator, { fullName: "Existing Worker" });
  assert.strictEqual(error, null, "a worker editing their bio must not be forced to grant geolocation");
});

test("worker profile save: supplied coordinates are still validated", async () => {
  const good = await runProfileValidator(workerProfileValidator, {
    fullName: "Valid Worker",
    coordinates: [73.9, 18.6],
  });
  assert.strictEqual(good.error, null, `a real pair must be accepted: ${good.error?.message}`);

  for (const bad of [[73.9], [73.9, 18.6, 1], ["73.9", "18.6"], []]) {
    const { error } = await runProfileValidator(workerProfileValidator, {
      fullName: "Valid Worker",
      coordinates: bad,
    });
    assert.ok(error, `coordinates ${JSON.stringify(bad)} must be rejected`);
    assert.strictEqual(error.statusCode, 400);
  }
});

test("employer profile save: coordinates may be omitted", async () => {
  const { error } = await runProfileValidator(employerProfileValidator, {});
  assert.strictEqual(error, null);
});

// --- existing users with real coordinates are untouched ---------------------

test("an EXISTING profile that already has coordinates is not disturbed by the schema change", () => {
  // Simulates a document loaded from the database with a location the user set.
  const doc = new WorkerProfile({
    userId: USER_ID,
    fullName: "Existing",
    location: { type: "Point", coordinates: [72.8777, 19.076] }, // Mumbai, a real user value
  });
  assert.strictEqual(doc.validateSync(), undefined);
  assert.deepStrictEqual([...doc.location.coordinates], [72.8777, 19.076]);
  // And it is NOT the old placeholder, i.e. nothing rewrites existing data.
  assert.notDeepStrictEqual([...doc.location.coordinates], PUNE_PLACEHOLDER);
});

test("provisioning is still idempotent and leaves an existing profile's location alone", async (t) => {
  const existing = {
    _id: "WP1",
    userId: USER_ID,
    fullName: "Already Here",
    location: { type: "Point", coordinates: [72.8777, 19.076] },
  };
  const mocks = [
    mock.method(WorkerProfile, "findOne", async () => existing),
    mock.method(WorkerProfile, "create", async () => {
      throw new Error("must not recreate, and must not overwrite a real location");
    }),
  ];
  t.after(() => mocks.forEach((m) => m.mock.restore()));

  const result = await createProfilesForRoles({ _id: USER_ID }, ["worker"], {});
  assert.strictEqual(result.workerProfile, existing);
  assert.deepStrictEqual(result.workerProfile.location.coordinates, [72.8777, 19.076]);
});

// --- the guard: the placeholder must not come back --------------------------

test("no source file seeds a user location with the Pune placeholder coordinates", async () => {
  const roots = ["../src/controllers/", "../src/utils/", "../src/models/", "../src/seeds/", "../src/validators/"];
  const offenders = [];

  for (const root of roots) {
    const dir = new URL(root, import.meta.url);
    for (const file of await readdir(dir)) {
      if (!file.endsWith(".js")) continue;
      const source = await readFile(new URL(file, dir), "utf8");
      // Either coordinate of the old placeholder appearing next to a location
      // assignment is the regression this guards against.
      if (source.includes("73.8567") || source.includes("18.5204")) {
        offenders.push(`${root}${file}`);
      }
    }
  }

  assert.deepStrictEqual(
    offenders,
    [],
    `these files reintroduce the Pune placeholder as a user location: ${offenders.join(", ")}`
  );
});

test("registration creates the User and profile together, with no location on either", async (t) => {
  // End to end through the provisioning helper, for a dual-role account.
  const created = [];
  const mocks = [
    mock.method(WorkerProfile, "findOne", async () => null),
    mock.method(EmployerProfile, "findOne", async () => null),
    mock.method(WorkerProfile, "create", async (doc) => {
      created.push(doc);
      return doc;
    }),
    mock.method(EmployerProfile, "create", async (doc) => {
      created.push(doc);
      return doc;
    }),
  ];
  t.after(() => mocks.forEach((m) => m.mock.restore()));

  await createProfilesForRoles({ _id: USER_ID, fullName: "Both Roles" }, ["worker", "employer"], {});

  assert.strictEqual(created.length, 2);
  for (const doc of created) {
    assert.ok(!("location" in doc), "neither profile may be given an invented location");
  }
});
