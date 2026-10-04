import { uploadOnCloudinary, deleteFromCloudinary } from "../utils/cloudinary.js";

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
 * Used by chat's uploadVoiceMessage. Voice-profile recordings do not go
 * through here (or anywhere else) - they are transcribed and deleted.
 * @param {string} localFilePath
 * @returns {Promise<Object>}
 */
export const uploadAudioService = async (localFilePath) => {
  return await uploadOnCloudinary(localFilePath, "lokrozgar/audio");
};

// Voice-profile recordings are NOT uploaded anywhere: they are transcribed
// and deleted in the same request (see voiceProfile.controller.js). The
// former uploadVoiceProfileAudioService / B2 re-exports were removed with
// that behaviour. The B2 helpers themselves remain in utils/b2.js.

/**
 * Upload PDF document (resume, verification doc) to Cloudinary.
 * @param {string} localFilePath
 * @returns {Promise<Object>}
 */
export const uploadPDFService = async (localFilePath) => {
  return await uploadOnCloudinary(localFilePath, "lokrozgar/documents");
};

export { deleteFromCloudinary };
