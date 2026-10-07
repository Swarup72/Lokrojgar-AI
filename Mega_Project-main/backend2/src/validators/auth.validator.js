import { z } from "zod";

export const sendOTPValidator = z.object({
  body: z.object({
    phone: z.string().min(10, "Phone number must be at least 10 digits"),
    purpose: z.enum(["login", "register", "password_reset", "verify_phone"]).optional(),
  }),
});

export const verifyOTPValidator = z.object({
  body: z.object({
    phone: z.string().min(10, "Phone number is required"),
    otp: z.string().length(6, "OTP must be exactly 6 digits"),
    purpose: z.enum(["login", "register", "password_reset", "verify_phone"]).optional(),
  }),
});

export const registerValidator = z.object({
  body: z.object({
    phone: z.string().min(10, "Phone number is required"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    // "admin" is intentionally excluded here - public self-registration must
    // never be able to grant admin. Admin is still a valid User.roles enum
    // value (see constants.js ROLES) for internal/trusted assignment; this
    // validator only narrows what the PUBLIC /auth/register endpoint accepts,
    // enforced before the request ever reaches the controller/User.create().
    roles: z.array(z.enum(["worker", "employer"])).min(1, "At least one role is required"),
    // Required for every account, not just workers: it is the canonical
    // personal name (User.fullName) and the fallback an employer without a
    // business name is displayed as.
    fullName: z
      .string({ error: "Your name is required" })
      .trim()
      .min(2, "Your name must be at least 2 characters"),
    // Optional by product decision - an employer may hire under their own
    // personal name. A blank string is normalized away rather than stored.
    businessName: z.string().trim().min(2, "Business name must be at least 2 characters").optional(),
    businessType: z.string().optional(),
    preferredLanguage: z.enum(["mr", "hi", "en"]).optional(),
  }),
});

export const loginValidator = z.object({
  body: z.object({
    phone: z.string().min(10, "Phone number is required"),
    password: z.string().min(1, "Password is required"),
  }),
});

export const changePasswordValidator = z.object({
  body: z.object({
    oldPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(6, "New password must be at least 6 characters"),
  }),
});

export const resetPasswordValidator = z.object({
  body: z.object({
    phone: z.string().min(10, "Phone number is required"),
    otp: z.string().length(6, "OTP is required"),
    newPassword: z.string().min(6, "New password must be at least 6 characters"),
  }),
});

// POST /auth/add-role - how a worker becomes an employer (or vice versa) on
// the SAME account. "admin" is absent by design: this endpoint is reachable
// by any authenticated user and must never grant privilege.
export const addRoleValidator = z.object({
  body: z.object({
    role: z.enum(["worker", "employer"], { message: "Role must be worker or employer" }),
    // Optional details used only to populate the newly created profile.
    fullName: z.string().trim().min(2, "Your name must be at least 2 characters").optional(),
    businessName: z.string().trim().min(2, "Business name must be at least 2 characters").optional(),
    businessType: z.string().trim().min(2, "Business type must be at least 2 characters").optional(),
  }),
});
