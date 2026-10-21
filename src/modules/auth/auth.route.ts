import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { authLimiter } from "../../middleware/rateLimiter";
import { validate } from "../../middleware/validate";
import * as controller from "./auth.controller";
import { loginSchema, registerSchema } from "./auth.validator";

const router = Router();
router.post(
  "/register",
  authLimiter,
  validate({ body: registerSchema }),
  controller.register,
);
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

export default router;
