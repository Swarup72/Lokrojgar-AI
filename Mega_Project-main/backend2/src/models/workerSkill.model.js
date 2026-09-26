import mongoose from "mongoose";

const workerSkillSchema = new mongoose.Schema({
  workerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "WorkerProfile",
    required: true,
  },

  skillId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Skill",
    required: true,
  },

  proficiency: {
    type: String,
    enum: ["beginner", "intermediate", "expert"],
    required: true,
  },

  verificationStatus: {
    type: String,
    enum: ["unverified", "pending", "verified", "revoked"],
    default: "unverified",
  },


  evidenceJobIds: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
    },
  ],

  verifiedAt: {
    type: Date,
    default: null,
  },

  verifiedByAdminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
  },
});

// Worker can have a skill only once
workerSkillSchema.index(
  { workerId: 1, skillId: 1 },
  { unique: true }
);

// Useful for finding verified/pending workers by skill
workerSkillSchema.index({
  skillId: 1,
  verificationStatus: 1,
});

const WorkerSkill = mongoose.model(
  "WorkerSkill",
  workerSkillSchema
);

export default WorkerSkill;