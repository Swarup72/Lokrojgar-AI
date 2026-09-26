import mongoose from "mongoose";

const jobCategorySchema = new mongoose.Schema(
  {
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

    description: {
      type: String,
      trim: true,
    },

    isActive: {
      type: Boolean,
      default: true,
      required: true,
    },
  }
);

const JobCategory = mongoose.model("JobCategory", jobCategorySchema);

export default JobCategory;