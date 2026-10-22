import { Router } from "express";
import { ROLE_GROUPS } from "../../config/roles";
import { authenticate, authorize } from "../../middleware/authenticate";
import { validate } from "../../middleware/validate";
import * as controller from "./schedule.controller";
import {
  cancelScheduleSchema,
  createScheduleSchema,
  generateScheduleSchema,
  idParamSchema,
  listSchedulesQuery,
  rescheduleSchema,
} from "./schedule.validator";

const router = Router();
router.post("/", validate({ body: createScheduleSchema }), controller.create);

export default router;
