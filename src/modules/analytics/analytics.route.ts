import { Router } from "express";
import { ROLE_GROUPS } from "../../config/roles";
import { authenticate, authorize } from "../../middleware/authenticate";
import { validate } from "../../middleware/validate";
import * as controller from "./analytics.controller";
import { analyticsQuery } from "./analytics.validator";

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
