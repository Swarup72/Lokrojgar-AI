import mongoose from "mongoose";

const skillSchema = new mongoose.Schema({
  name: {
    mr: {
      type: String,
      required: true,
      trim: true,
    },

    hi: {
      type: String,
      required: true,
      trim: true,
    },

    en: {
      type: String,
      required: true,
      trim: true,
    },
  },

  categoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "JobCategory",
    required: true,
    index: true,
  },

  isActive: {
    type: Boolean,
    default: true,
  },
});

const Skill = mongoose.model("Skill", skillSchema);

export default Skill;