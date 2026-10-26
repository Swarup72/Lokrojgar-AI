#!/usr/bin/env node

/**
 * Secure CLI utility to create or promote an administrator account.
 *
 * Usage:
 *   node scripts/create-admin.mjs --phone=+919999999999 --password=SecurePassword123 --name="Admin User"
 *
 * Alternatively, specify via environment variables:
 *   ADMIN_PHONE=+919999999999 ADMIN_PASSWORD=SecurePassword123 ADMIN_NAME="Admin User" node scripts/create-admin.mjs
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import { normalizePhone, isValidPhone } from "../src/utils/phone.js";

dotenv.config();

function parseArgs() {
  const args = {};
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--")) {
      const [key, ...rest] = arg.slice(2).split("=");
      args[key] = rest.join("=");
    }
  }
  return args;
}

const args = parseArgs();
const rawPhone = args.phone || process.env.ADMIN_PHONE;
const password = args.password || process.env.ADMIN_PASSWORD;
const fullName = args.name || process.env.ADMIN_NAME || "System Administrator";

if (!rawPhone || !password) {
  console.error("Error: Both phone and password are required.");
  console.error("Usage: node scripts/create-admin.mjs --phone=+91XXXXXXXXXX --password=SECRET [--name=\"Admin Name\"]");
  console.error("Or set ADMIN_PHONE and ADMIN_PASSWORD environment variables.");
  process.exit(1);
}

if (!isValidPhone(rawPhone)) {
  console.error("Error: Invalid phone number format. Must be 10 digits or start with +91.");
  process.exit(1);
}

if (password.length < 8) {
  console.error("Error: Password must be at least 8 characters long.");
  process.exit(1);
}

const phone = normalizePhone(rawPhone);
const mongoUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/lokrozgar";

async function main() {
  try {
    console.log("Connecting to database...");
    await mongoose.connect(mongoUri);

    // Dynamic import of User model after db connection setup
    const { default: User } = await import("../src/models/user.model.js");

    let user = await User.findOne({ phone });

    if (user) {
      console.log(`User found with phone ${phone}. Updating administrator permissions...`);
      if (!user.roles.includes("admin")) {
        user.roles.push("admin");
      }
      user.passwordHash = password; // pre-save hook will hash this
      if (fullName && !user.fullName) {
        user.fullName = fullName;
      }
      user.isVerified = true;
      user.isBlocked = false;
      await user.save();
      console.log(`Successfully granted admin role to user: ${user._id} (${user.phone})`);
    } else {
      console.log(`Creating new administrator account for ${phone}...`);
      user = await User.create({
        phone,
        passwordHash: password,
        fullName,
        roles: ["admin"],
        preferredLanguage: "en",
        isVerified: true,
        isBlocked: false,
        phoneVerifiedAt: new Date(),
      });
      console.log(`Administrator account created successfully with ID: ${user._id}`);
    }

    console.log("Admin setup completed successfully.");
    process.exit(0);
  } catch (error) {
    console.error("Failed to create administrator:", error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

main();
