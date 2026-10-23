import { z } from "zod";

const email = z
  .email("Invalid email address")
  .transform((v) => v.toLowerCase());

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128)
  .regex(/[A-Za-z]/, "Password must contain a letter")
  .regex(/\d/, "Password must contain a number");

const otp = z.string().regex(/^\d{6}$/, "OTP must be a 6-digit code");

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email,
  password: passwordSchema,
  phone: z
    .string()
    .regex(/^\+?[0-9]{7,15}$/, "Invalid phone number")
    .optional(),
  address: z.string().trim().max(255).optional(),
  meterNumber: z.string().trim().min(3).max(30).optional(),
  areaId: z.string().min(1).optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Password is required"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const verifyEmailSchema = z.object({ email, otp });
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export const emailOnlySchema = z.object({ email });

export const resetPasswordSchema = z.object({
  email,
  otp,
  newPassword: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const changePasswordSchema = z
  .object({
    otp,
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: passwordSchema,
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    message: "New password must be different from the current password",
    path: ["newPassword"],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
