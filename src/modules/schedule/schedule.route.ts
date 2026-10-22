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
router.use(authenticate);

const staff = authorize(...ROLE_GROUPS.STAFF);

router.get("/", validate({ query: listSchedulesQuery }), controller.list);
router.post(
  "/",
  staff,
  validate({ body: createScheduleSchema }),
  controller.create,
);
router.post(
  "/generate",
  staff,
  validate({ body: generateScheduleSchema }),
  controller.generate,
);
router.get("/:id", validate({ params: idParamSchema }), controller.getById);
router.patch(
  "/:id",
  staff,
  validate({ params: idParamSchema, body: rescheduleSchema }),
  controller.reschedule,
);
router.post(
  "/:id/cancel",
  staff,
  validate({ params: idParamSchema, body: cancelScheduleSchema }),
  controller.cancel,
);
router.delete(
  "/:id",
  authorize(...ROLE_GROUPS.ADMIN),
  validate({ params: idParamSchema }),
  controller.remove,
);

export default router;
