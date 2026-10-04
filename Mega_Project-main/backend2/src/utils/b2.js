import fs from "fs";
import path from "path";
import crypto from "crypto";
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Backblaze B2 storage for voice-profile audio only, via B2's S3-compatible
 * API. Scoped deliberately to voice-profile: worker/employer profile
 * photos, resumes/documents, and chat voice messages still use Cloudinary
 * (see storage.service.js) - migrating those was out of scope and would
 * have touched unrelated features.
 *
 * The client is built lazily (not at module load) so a missing/incomplete
 * B2 configuration produces a clear AiServiceUnavailableError-style failure
 * at upload time instead of a confusing crash at import time, and so tests
 * can exercise the "not configured" path without real env vars.
 */

let cachedClient = null;
let cachedConfigKey = null;

const REQUIRED_VARS = ["B2_APPLICATION_KEY_ID", "B2_APPLICATION_KEY", "B2_BUCKET_NAME", "B2_REGION", "B2_ENDPOINT"];

// STATUS: this module currently has no production consumer.
//
// It existed for voice-profile recordings, which are now treated as a
// processing artifact - transcribed and deleted in the same request, never
// uploaded (see controllers/voiceProfile.controller.js). The helpers are
// kept, working and tested, because B2 remains the project's object-storage
// option and the historical voice-profile objects still need a way to be
// listed and deleted. Chat audio and all images/PDFs go to Cloudinary and
// never touched this module.
//
// deleteAudioFromB2 / getSignedAudioUrl have never had a production caller.

export class B2ConfigError extends Error {}
export class B2UploadError extends Error {}

function getConfig() {
  const config = {
    keyId: process.env.B2_APPLICATION_KEY_ID,
    appKey: process.env.B2_APPLICATION_KEY,
    bucket: process.env.B2_BUCKET_NAME,
    region: process.env.B2_REGION,
    endpoint: process.env.B2_ENDPOINT,
  };

  const missing = REQUIRED_VARS.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new B2ConfigError(`Backblaze B2 is not configured - missing: ${missing.join(", ")}`);
  }

  return config;
}

/**
 * Returns the shared S3Client for Backblaze B2, rebuilding it if the
 * configuration has changed (mirrors the fresh-env-var-read pattern used
 * elsewhere in this project for testability, rather than baking credentials
 * into a module-level constant at import time).
 */
export function getB2Client() {
  const config = getConfig();
  const configKey = `${config.endpoint}|${config.region}|${config.keyId}`;

  if (cachedClient && cachedConfigKey === configKey) {
    return cachedClient;
  }

  cachedClient = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.keyId,
      secretAccessKey: config.appKey,
    },
  });
  cachedConfigKey = configKey;
  return cachedClient;
}

const EXTENSION_FALLBACK_CONTENT_TYPE = "application/octet-stream";

/**
 * Uploads a local audio file to the configured B2 bucket under a
 * non-guessable key (never the original filename) and returns the stable
 * object key - not a URL, since the bucket is private (see PHASE 4: no
 * public access, no permanently-stored presigned URL).
 *
 * Does NOT delete the local file itself (unlike the Cloudinary
 * uploadOnCloudinary it replaces for this one feature) - the caller
 * (voiceProfile.controller.js) owns the temp file's entire lifecycle in its
 * own finally block, so this function's failure/success behavior can never
 * accidentally delete a file another step still needs to read.
 *
 * @param {string} localFilePath
 * @param {{workerId: string, originalName?: string, contentType?: string}} options
 * @returns {Promise<{key: string, bucket: string, size: number}>}
 */
export async function uploadAudioToB2(localFilePath, { workerId, originalName, contentType }) {
  if (!localFilePath || !fs.existsSync(localFilePath)) {
    throw new B2UploadError("Local audio file does not exist.");
  }

  const config = getConfig();
  const client = getB2Client();

  const extension = path.extname(originalName || localFilePath) || "";
  const key = `voice-profiles/${workerId}/${crypto.randomUUID()}${extension}`;
  const body = fs.readFileSync(localFilePath);

  try {
    await client.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: body,
        ContentType: contentType || EXTENSION_FALLBACK_CONTENT_TYPE,
      })
    );
  } catch (error) {
    // Never let a raw AWS SDK error (which can embed request metadata) reach
    // the caller unfiltered - re-throw a clean error with just the parts
    // that are safe and useful to log (name/code), never credentials.
    throw new B2UploadError(`Backblaze B2 upload failed: ${error.name || "UnknownError"} - ${error.message || ""}`);
  }

  return { key, bucket: config.bucket, size: body.length };
}

/** @param {string} objectKey */
export async function deleteAudioFromB2(objectKey) {
  if (!objectKey) return null;
  const config = getConfig();
  const client = getB2Client();

  try {
    return await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: objectKey }));
  } catch (error) {
    throw new B2UploadError(`Backblaze B2 delete failed: ${error.name || "UnknownError"} - ${error.message || ""}`);
  }
}

/**
 * Generates a short-lived signed GET URL for a private object - never
 * stored, always generated fresh for the moment it's needed. Not currently
 * wired into any route (nothing in the product plays back a saved voice
 * recording yet), kept here ready for when that's a real requirement.
 * @param {string} objectKey
 * @param {number} [expiresIn] seconds, default 5 minutes
 */
export async function getSignedAudioUrl(objectKey, expiresIn = 300) {
  const config = getConfig();
  const client = getB2Client();
  const command = new GetObjectCommand({ Bucket: config.bucket, Key: objectKey });
  return getSignedUrl(client, command, { expiresIn });
}
