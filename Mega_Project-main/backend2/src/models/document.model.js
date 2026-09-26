import mongoose from "mongoose";

const documentSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    documentType: {
      type: String,
      enum: [
        "id_proof",
        "certificate",
        "profile_photo",
        "business_license",
      ],
      required: true,
    },

    fileUrl: {
      type: String,
      required: true,
      trim: true,
    },

    verificationStatus: {
      type: String,
      enum: ["pending", "verified", "rejected"],
      default: "pending",
      required: true,
    },

    verifiedByAdminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    uploadedAt: {
      type: Date,
      default: Date.now,
      required: true,
    },

    verifiedAt: {
      type: Date,
    },

  },
  {
    timestamps: false,
  }
);

const Document = mongoose.model("Document", documentSchema);

export default Document;