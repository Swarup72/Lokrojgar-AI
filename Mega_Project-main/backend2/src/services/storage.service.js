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
 * Upload audio file (voice profile, chat voice message) to Cloudinary.
 * @param {string} localFilePath
 * @returns {Promise<Object>}
 */
export const uploadAudioService = async (localFilePath) => {
  return await uploadOnCloudinary(localFilePath, "lokrozgar/audio");
};

/**
 * Upload PDF document (resume, verification doc) to Cloudinary.
 * @param {string} localFilePath
 * @returns {Promise<Object>}
 */
export const uploadPDFService = async (localFilePath) => {
  return await uploadOnCloudinary(localFilePath, "lokrozgar/documents");
};

export { deleteFromCloudinary };
