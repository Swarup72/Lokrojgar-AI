import multer from "multer";
import path from "path";
import fs from "fs";
import { ApiError } from "../utils/ApiError.js";

// Ensure temp directory exists
const tempDir = "./public/temp";
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Storage Configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, tempDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  },
});

// Allowed MIME Types
const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/jpg",
];

const ALLOWED_AUDIO_TYPES = [
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "audio/mp4",
  "audio/m4a",
  "audio/webm",
  "audio/x-m4a",
];

const ALLOWED_PDF_TYPES = ["application/pdf"];

// File Filter Function
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    ...ALLOWED_IMAGE_TYPES,
    ...ALLOWED_AUDIO_TYPES,
    ...ALLOWED_PDF_TYPES,
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new ApiError(
        400,
        `Invalid file type (${file.mimetype}). Allowed types: Images (JPEG, PNG, WEBP), Audio (MP3, WAV, OGG, M4A, WEBM), PDF`
      ),
      false
    );
  }
};

// General Multer Instance with 10MB limit
export const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB limit
  },
  fileFilter,
});

// Specialized Image Upload Handler
export const uploadImage = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB limit
  fileFilter: (req, file, cb) => {
    if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new ApiError(400, "Only image files (JPEG, PNG, WEBP) are allowed"), false);
    }
  },
});

// Specialized Audio Upload Handler
export const uploadAudio = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB limit
  fileFilter: (req, file, cb) => {
    if (ALLOWED_AUDIO_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new ApiError(400, "Only audio files (MP3, WAV, OGG, M4A, WEBM) are allowed"), false);
    }
  },
});

// Specialized PDF Upload Handler
export const uploadPDF = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB limit
  fileFilter: (req, file, cb) => {
    if (ALLOWED_PDF_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new ApiError(400, "Only PDF documents are allowed"), false);
    }
  },
});
