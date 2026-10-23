import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { authLimiter } from "../../middleware/rateLimiter";
import { validate } from "../../middleware/validate";
import * as controller from "./auth.controller";
import {
  changePasswordSchema,
  emailOnlySchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from "./auth.validator";

const router = Router();

// Signup + email verification (OTP via Redis)
router.post(
  "/register",
  authLimiter,
  validate({ body: registerSchema }),
  controller.register,
);
router.post(
  "/verify-email",
  authLimiter,
  validate({ body: verifyEmailSchema }),
  controller.verifyEmail,
);
router.post(
  "/resend-otp",
  authLimiter,
  validate({ body: emailOnlySchema }),
  controller.resendOtp,
);

// Session
router.post(
  "/login",
  authLimiter,
  validate({ body: loginSchema }),
  controller.login,
);
router.post(
  "/refresh-token",
  authLimiter,
  authenticate,
  controller.refreshToken,
);
router.post("/logout", authenticate, controller.logout);

// Forgot / reset password (OTP via Redis)
router.post(
  "/forgot-password",
  authLimiter,
  validate({ body: emailOnlySchema }),
  controller.forgotPassword,
);
router.post(
  "/reset-password",
  authLimiter,
  validate({ body: resetPasswordSchema }),
  controller.resetPassword,
);

// Change password while logged in (OTP via Redis)
router.post(
  "/change-password/send-otp",
  authLimiter,
  authenticate,
  controller.sendChangePasswordOtp,
);
router.post(
  "/change-password",
  authLimiter,
  authenticate,
  validate({ body: changePasswordSchema }),
  controller.changePassword,
);

export default router;
