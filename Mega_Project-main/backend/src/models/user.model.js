import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    phone: {
      type: String,
      required: [true, "Phone number is required"],
      unique: true,
      trim: true,
    },

    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: null,
    },

    passwordHash: {
      type: String,
      required: [true, "Password is required"],
    },

    roles: {
      type: [
        {
          type: String,
          enum: ["worker", "employer", "admin"],
        },
      ],
      required: true,
      validate: {
        validator: function (roles) {
          return roles.length > 0;
        },
        message: "At least one role is required",
      },
    },

    preferredLanguage: {
      type: String,
      enum: ["mr", "hi", "en"],
      default: "en",
    },

    isVerified: {
      type: Boolean,
      default: false,
    },

    lastLoginAt: {
      type: Date,
      default: null,
    },

    fraudScore: {
      type: Number,
      default: null,
      min: 0,
      max: 100,
    },

    fraudScoreUpdatedAt: {
      type: Date,
      default: null,
    },

    isFlagged: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Email is unique only when an email is actually provided
userSchema.index(
  { email: 1 },
  {
    unique: true,
    partialFilterExpression: {
      email: { $type: "string" },
    },
  }
);

const User = mongoose.model("User", userSchema);

export default User;