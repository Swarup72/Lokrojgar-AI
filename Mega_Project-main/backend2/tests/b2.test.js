import test from "node:test";
import assert from "node:assert";
import { mock } from "node:test";
import fs from "fs";
import path from "path";
import { uploadAudioToB2, deleteAudioFromB2, getSignedAudioUrl, getB2Client, B2ConfigError, B2UploadError } from "../src/utils/b2.js";

const FIXTURE_DIR = new URL("./fixtures/", import.meta.url).pathname;
const FIXTURE_PATH = path.join(FIXTURE_DIR, "b2-test-audio.wav");

const REAL_B2_ENV = {
  B2_APPLICATION_KEY_ID: "test-key-id",
  B2_APPLICATION_KEY: "test-app-key",
  B2_BUCKET_NAME: "test-bucket",
  B2_REGION: "us-test-000",
  B2_ENDPOINT: "https://s3.us-test-000.backblazeb2.com",
};

function setB2Env() {
  Object.assign(process.env, REAL_B2_ENV);
}

function clearB2Env() {
  for (const key of Object.keys(REAL_B2_ENV)) delete process.env[key];
}

test.before(() => {
  fs.mkdirSync(FIXTURE_DIR, { recursive: true });
  fs.writeFileSync(FIXTURE_PATH, Buffer.from("fake-audio-bytes"));
  setB2Env();
});

test.after(() => {
  if (fs.existsSync(FIXTURE_PATH)) fs.unlinkSync(FIXTURE_PATH);
  setB2Env();
});

test("getB2Client throws B2ConfigError when configuration is missing", (t) => {
  clearB2Env();
  t.after(setB2Env);

  assert.throws(() => getB2Client(), B2ConfigError);
});

test("uploadAudioToB2 throws B2ConfigError when configuration is missing, checked before any upload attempt", async (t) => {
  clearB2Env();
  t.after(setB2Env);

  await assert.rejects(() => uploadAudioToB2(FIXTURE_PATH, { workerId: "WORKER001" }), B2ConfigError);
});

test("uploadAudioToB2 sends a PutObjectCommand with a generated key (not the original filename), correct bucket, and content type", async () => {
  const client = getB2Client();
  let capturedInput;
  const sendMock = mock.method(client, "send", async (command) => {
    capturedInput = command.input;
    return { ETag: '"abc123"' };
  });

  try {
    const result = await uploadAudioToB2(FIXTURE_PATH, {
      workerId: "WORKER001",
      originalName: "my recording.wav",
      contentType: "audio/wav",
    });

    assert.strictEqual(capturedInput.Bucket, "test-bucket");
    assert.match(capturedInput.Key, /^voice-profiles\/WORKER001\/[0-9a-f-]{36}\.wav$/);
    assert.notStrictEqual(capturedInput.Key, "my recording.wav");
    assert.strictEqual(capturedInput.ContentType, "audio/wav");
    assert.ok(Buffer.isBuffer(capturedInput.Body));

    assert.strictEqual(result.key, capturedInput.Key);
    assert.strictEqual(result.bucket, "test-bucket");
    assert.strictEqual(result.size, Buffer.from("fake-audio-bytes").length);
  } finally {
    sendMock.mock.restore();
  }
});

test("uploadAudioToB2 falls back to application/octet-stream when no contentType is given", async () => {
  const client = getB2Client();
  let capturedInput;
  const sendMock = mock.method(client, "send", async (command) => {
    capturedInput = command.input;
    return {};
  });

  try {
    await uploadAudioToB2(FIXTURE_PATH, { workerId: "WORKER001" });
    assert.strictEqual(capturedInput.ContentType, "application/octet-stream");
  } finally {
    sendMock.mock.restore();
  }
});

test("uploadAudioToB2 rejects when the local file does not exist, without ever calling send", async () => {
  const client = getB2Client();
  const sendMock = mock.method(client, "send", async () => {
    throw new Error("should not be called");
  });

  try {
    await assert.rejects(() => uploadAudioToB2("/no/such/file.wav", { workerId: "WORKER001" }), B2UploadError);
    assert.strictEqual(sendMock.mock.callCount(), 0);
  } finally {
    sendMock.mock.restore();
  }
});

test("uploadAudioToB2 wraps a real S3 client error in B2UploadError, without leaking credentials", async () => {
  const client = getB2Client();
  const sendMock = mock.method(client, "send", async () => {
    const error = new Error("Access Denied");
    error.name = "AccessDenied";
    throw error;
  });

  try {
    await assert.rejects(
      () => uploadAudioToB2(FIXTURE_PATH, { workerId: "WORKER001" }),
      (error) => {
        assert.ok(error instanceof B2UploadError);
        assert.match(error.message, /AccessDenied/);
        assert.doesNotMatch(error.message, /test-app-key/);
        return true;
      }
    );
  } finally {
    sendMock.mock.restore();
  }
});

test("getSignedAudioUrl generates a real signed URL for the configured bucket/key", async () => {
  const url = await getSignedAudioUrl("voice-profiles/WORKER001/some-uuid.wav", 60);

  // AWS SDK v3 defaults to virtual-hosted-style addressing (bucket name
  // prefixed onto the host), confirmed by actually generating one and
  // reading it rather than assuming path-style.
  assert.ok(url.startsWith("https://test-bucket.s3.us-test-000.backblazeb2.com/"));
  assert.match(url, /voice-profiles\/WORKER001\/some-uuid\.wav/);
  assert.match(url, /X-Amz-Expires=60/);
  assert.match(url, /X-Amz-Signature=[0-9a-f]+/);
  assert.match(url, /X-Amz-Credential=test-key-id/);
});

test("deleteAudioFromB2 returns null for an empty key without calling send", async () => {
  const client = getB2Client();
  const sendMock = mock.method(client, "send", async () => {
    throw new Error("should not be called");
  });

  try {
    const result = await deleteAudioFromB2(null);
    assert.strictEqual(result, null);
    assert.strictEqual(sendMock.mock.callCount(), 0);
  } finally {
    sendMock.mock.restore();
  }
});
