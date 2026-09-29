import { uploadOnCloudinary, deleteFromCloudinary } from "../utils/cloudinary.js";
import { uploadAudioToB2, deleteAudioFromB2, getSignedAudioUrl } from "../utils/b2.js";

/**
 * Upload image asset to Cloudinary.
 * @param {string} localFilePath
 * @returns {Promise<Object>}
 */
export const uploadImageService = async (localFilePath) => {
  return await uploadOnCloudinary(localFilePath, "lokrozgar/images");
};

/**
 * Upload audio file (chat voice message) to Cloudinary.
 *
 * NOT used by voice-profile - see uploadVoiceProfileAudioService below,
 * which stores voice-profile recordings in Backblaze B2 instead. Kept here
 * unchanged for chat's uploadVoiceMessage, a genuinely separate feature
 * that was out of scope for the B2 migration.
 * @param {string} localFilePath
 * @returns {Promise<Object>}
 */
export const uploadAudioService = async (localFilePath) => {
  return await uploadOnCloudinary(localFilePath, "lokrozgar/audio");
};

/**
 * Upload a voice-profile recording to Backblaze B2 (private bucket) instead
 * of Cloudinary. Returns a stable object key, not a URL - the bucket is
 * private, so playback (if ever needed) goes through getSignedAudioUrl
 * below rather than a permanently-stored link.
 * @param {string} localFilePath
 * @param {{workerId: string, originalName?: string, contentType?: string}} options
 * @returns {Promise<{key: string, bucket: string, size: number}>}
 */
export const uploadVoiceProfileAudioService = async (localFilePath, options) => {
  return await uploadAudioToB2(localFilePath, options);
};

export { deleteAudioFromB2, getSignedAudioUrl };

/**
 * Upload PDF document (resume, verification doc) to Cloudinary.
 * @param {string} localFilePath
 * @returns {Promise<Object>}
 */
export const uploadPDFService = async (localFilePath) => {
  return await uploadOnCloudinary(localFilePath, "lokrozgar/documents");
};

export { deleteFromCloudinary };
