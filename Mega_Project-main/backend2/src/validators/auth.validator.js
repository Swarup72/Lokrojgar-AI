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
    roles: z.array(z.enum(["worker", "employer", "admin"])).min(1, "At least one role is required"),
    fullName: z.string().optional(),
    businessName: z.string().optional(),
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
