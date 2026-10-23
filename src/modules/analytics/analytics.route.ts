import { Router } from "express";
import { ROLE_GROUPS } from "../../config/roles.js";
import { authenticate, authorize } from "../../middleware/authenticate.js";
import { validate } from "../../middleware/validate.js";
import * as controller from "./analytics.controller.js";
import { analyticsQuery } from "./analytics.validator.js";

const router = Router();
router.use(
  authenticate,
  authorize(...ROLE_GROUPS.STAFF),
  validate({ query: analyticsQuery }),
);

router.get("/outage-summary", controller.outageSummary);
router.get("/area-reliability", controller.areaReliability);
router.get("/technician-performance", controller.technicianPerformance);

export default router;
