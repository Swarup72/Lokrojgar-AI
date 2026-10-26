import mongoose from "mongoose";

const adminActionSchema = new mongoose.Schema(
  {
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    actionType: {
      type: String,
      required: true,
      trim: true,
    },

    targetUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    targetJobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
    },

    details: {
      type: String,
      trim: true,
    },

    metadata: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  {
    timestamps: {
      createdAt: true,
      updatedAt: false,
    },
  }
);

adminActionSchema.index({ createdAt: -1 });
adminActionSchema.index({ actionType: 1, createdAt: -1 });
adminActionSchema.index({ adminId: 1, createdAt: -1 });
adminActionSchema.index({ targetUserId: 1, createdAt: -1 });

const AdminAction = mongoose.model("AdminAction", adminActionSchema);

export default AdminAction;