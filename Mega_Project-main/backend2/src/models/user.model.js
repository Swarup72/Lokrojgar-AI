import mongoose from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { USER_ROLES, ROLES, LANGUAGES, PREFERRED_LANGUAGES, TOKEN_EXPIRY } from "../constants.js";

const userSchema = new mongoose.Schema(
  {
    phone: {
      type: String,
      required: [true, "Phone number is required"],
      unique: true,
      trim: true,
      validate: {
        validator: function (v) {
          // Validates Indian phone numbers (+91XXXXXXXXXX or 10 digits starting with 6-9)
          return /^(?:\+91)?[6-9]\d{9}$/.test(v);
        },
        message: (props) => `${props.value} is not a valid phone number! Must be 10 digits or start with +91.`,
      },
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
          enum: ROLES,
        },
      ],
      required: true,
      validate: {
        validator: function (roles) {
          return Array.isArray(roles) && roles.length > 0;
        },
        message: "At least one role is required",
      },
    },

    preferredLanguage: {
      type: String,
      enum: PREFERRED_LANGUAGES,
      default: LANGUAGES.ENGLISH,
    },

    isVerified: {
      type: Boolean,
      default: false,
    },

    isBlocked: {
      type: Boolean,
      default: false,
    },

    phoneVerifiedAt: {
      type: Date,
      default: null,
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

// Pre-save hook for password hashing
userSchema.pre("save", async function (next) {
  if (!this.isModified("passwordHash")) return ;
  this.passwordHash = await bcrypt.hash(this.passwordHash, 10);
  // next();
});

// Helper method to compare password
userSchema.methods.isPasswordCorrect = async function (password) {
  return await bcrypt.compare(password, this.passwordHash);
};

// Method to generate Access Token
userSchema.methods.generateAccessToken = function () {
  return jwt.sign(
    {
      _id: this._id,
      phone: this.phone,
      email: this.email,
      roles: this.roles,
    },
    process.env.ACCESS_TOKEN_SECRET || "access_secret",
    {
      expiresIn: TOKEN_EXPIRY.ACCESS_TOKEN,
    }
  );
};

// Method to generate Refresh Token
userSchema.methods.generateRefreshToken = function () {
  return jwt.sign(
    {
      _id: this._id,
    },
    process.env.REFRESH_TOKEN_SECRET || "refresh_secret",
    {
      expiresIn: TOKEN_EXPIRY.REFRESH_TOKEN,
    }
  );
};

const User = mongoose.model("User", userSchema);

export default User;