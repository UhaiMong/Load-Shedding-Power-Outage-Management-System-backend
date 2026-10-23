import { Router } from "express";
import { ROLE_GROUPS, Role } from "../../config/roles";
import { authenticate, authorize } from "../../middleware/authenticate";
import { paymentLimiter } from "../../middleware/rateLimiter";
import { validate } from "../../middleware/validate";
import * as controller from "./payment.controller";
import {
  callbackQuerySchema,
  idParamSchema,
  initiatePaymentSchema,
  listPaymentsQuery,
  webhookSchema,
} from "./payment.validator";

const router = Router();

// public (called by bKash / the customer's browser)
router.get(
  "/callback/:id",
  paymentLimiter,
  validate({ params: idParamSchema, query: callbackQuerySchema }),
  controller.callback,
);
router.post(
  "/webhook",
  paymentLimiter,
  validate({ body: webhookSchema }),
  controller.webhook,
);

// protected
router.use(authenticate);
const viewers = authorize(Role.CUSTOMER, ...ROLE_GROUPS.BILLING);

router.post(
  "/initiate",
  authorize(...ROLE_GROUPS.CUSTOMER),
  paymentLimiter,
  validate({ body: initiatePaymentSchema }),
  controller.initiate,
);
router.get(
  "/",
  viewers,
  validate({ query: listPaymentsQuery }),
  controller.list,
);
router.get(
  "/:id",
  viewers,
  validate({ params: idParamSchema }),
  controller.getById,
);
router.post(
  "/:id/verify",
  viewers,
  paymentLimiter,
  validate({ params: idParamSchema }),
  controller.verify,
);

export default router;
