import { v2 as cloudinary } from "cloudinary";
import fs from "fs";

// Configure Cloudinary from environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Upload a local file to Cloudinary and remove local temp file.
 * @param {string} localFilePath - Local path of file to upload
 * @param {string} folder - Optional Cloudinary folder name
 * @returns {Promise<Object|null>} Cloudinary upload response or null on error
 */
const uploadOnCloudinary = async (localFilePath, folder = "lokrozgar") => {
  try {
    if (!localFilePath) return null;

    // Upload file to Cloudinary
    const response = await cloudinary.uploader.upload(localFilePath, {
      resource_type: "auto",
      folder: folder,
    });

    // Remove local file after successful upload
    if (fs.existsSync(localFilePath)) {
      fs.unlinkSync(localFilePath);
    }

    return response;
  } catch (error) {
    // Remove local file if upload operation failed
    if (localFilePath && fs.existsSync(localFilePath)) {
      fs.unlinkSync(localFilePath);
    }
    console.error("Cloudinary Upload Error:", error);
    return null;
  }
};

/**
 * Delete a resource from Cloudinary by public ID.
 * @param {string} publicId - Public ID of resource on Cloudinary
 * @param {string} resourceType - Resource type ('image', 'raw', 'video')
 * @returns {Promise<Object|null>}
 */
const deleteFromCloudinary = async (publicId, resourceType = "image") => {
  try {
    if (!publicId) return null;
    const response = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
    });
    return response;
  } catch (error) {
    console.error("Cloudinary Delete Error:", error);
    return null;
  }
};

export { uploadOnCloudinary, deleteFromCloudinary };
