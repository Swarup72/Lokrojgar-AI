import test from "node:test";
import assert from "node:assert";
import { normalizePhone, isValidPhone } from "../src/utils/phone.js";
import { calculateDistance, isWithinRadius } from "../src/utils/geo.js";
import { pickLanguage } from "../src/utils/languagePicker.js";
import { generateOTP, verifyOTP, hashOTP } from "../src/utils/otp.js";
import { calculateMatchScore } from "../src/services/matching.service.js";

test("Phone Normalizer & Validator", () => {
  assert.strictEqual(normalizePhone("9876543210"), "+919876543210");
  assert.strictEqual(normalizePhone("09876543210"), "+919876543210");
  assert.strictEqual(normalizePhone("+919876543210"), "+919876543210");
  assert.strictEqual(isValidPhone("9876543210"), true);
  assert.strictEqual(isValidPhone("12345"), false);
});

test("Geo Helpers & Distance Calculation", () => {
  // Mumbai to Pune distance ~120-150km
  const dist = calculateDistance(19.076, 72.8777, 18.5204, 73.8567);
  assert.ok(dist > 100 && dist < 160);

  // Proximity check within 10km
  const isClose = isWithinRadius([73.8567, 18.5204], [73.857, 18.521], 10);
  assert.strictEqual(isClose, true);
});

test("Language Picker with Fallbacks", () => {
  const multilangObj = {
    mr: "बांधकाम",
    hi: "निर्माण",
    en: "Construction",
  };

  assert.strictEqual(pickLanguage(multilangObj, "mr"), "बांधकाम");
  assert.strictEqual(pickLanguage(multilangObj, "hi"), "निर्माण");
  assert.strictEqual(pickLanguage(multilangObj, "en"), "Construction");
  assert.strictEqual(pickLanguage({ mr: "फक्त मराठी" }, "hi", "mr"), "फक्त मराठी");
});

test("OTP Generator & Bcrypt Hashing", async () => {
  const otp = generateOTP(6);
  assert.strictEqual(otp.length, 6);
  assert.ok(/^\d{6}$/.test(otp));

  const hash = await hashOTP(otp);
  const isValid = await verifyOTP(otp, hash);
  assert.strictEqual(isValid, true);

  const isInvalid = await verifyOTP("000000", hash);
  assert.strictEqual(isInvalid, false);
});

test("Matching Engine Match Score", () => {
  const dummyJob = {
    skillIds: ["skill1", "skill2"],
    location: { coordinates: [73.8567, 18.5204] },
    payAmount: 500,
  };

  const dummyWorker = {
    location: { coordinates: [73.857, 18.521] },
    availability: "available",
    expectedPay: 450,
    preferredWorkRadiusKm: 20,
    ratingAvg: 4.5,
  };

  const dummySkills = [{ skillId: "skill1" }, { skillId: "skill2" }];

  const { score } = calculateMatchScore(dummyJob, dummyWorker, dummySkills);
  assert.ok(score >= 80 && score <= 100);
});
