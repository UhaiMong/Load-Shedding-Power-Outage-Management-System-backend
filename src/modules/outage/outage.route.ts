import { Router } from "express";
import { ROLE_GROUPS } from "../../config/roles.js";
import { authenticate, authorize } from "../../middleware/authenticate.js";
import { uploadImage } from "../../middleware/upload.js";
import { validate } from "../../middleware/validate.js";
import * as controller from "./outage.controller.js";
import {
  assignSchema,
  idParamSchema,
  listOutagesQuery,
  rejectOutageSchema,
  reportOutageSchema,
  updateStatusSchema,
  verifyOutageSchema,
} from "./outage.validator.js";

const router = Router();
router.use(authenticate);

const staff = authorize(...ROLE_GROUPS.STAFF);
const idParam = validate({ params: idParamSchema });

router.post(
  "/report",
  authorize(...ROLE_GROUPS.CUSTOMER),
  uploadImage.single("image"),
  validate({ body: reportOutageSchema }),
  controller.report,
);
router.get("/", validate({ query: listOutagesQuery }), controller.list);
router.get(
  "/my-reports",
  authorize(...ROLE_GROUPS.CUSTOMER),
  validate({ query: listOutagesQuery }),
  controller.myReports,
);
router.get(
  "/my-assigned",
  authorize(...ROLE_GROUPS.TECHNICIAN),
  validate({ query: listOutagesQuery }),
  controller.myAssigned,
);

router.get("/:id", idParam, controller.getById);
router.get("/:id/timeline", idParam, controller.timeline);
router.patch(
  "/:id/verify",
  staff,
  validate({ params: idParamSchema, body: verifyOutageSchema }),
  controller.verify,
);
router.post(
  "/:id/reject",
  staff,
  validate({ params: idParamSchema, body: rejectOutageSchema }),
  controller.reject,
);
router.post(
  "/:id/assign",
  staff,
  validate({ params: idParamSchema, body: assignSchema }),
  controller.assign,
);
router.post("/:id/auto-assign", staff, idParam, controller.autoAssign);
router.patch(
  "/:id/status",
  authorize(...ROLE_GROUPS.TECHNICIAN),
  validate({ params: idParamSchema, body: updateStatusSchema }),
  controller.updateStatus,
);
router.delete(
  "/:id",
  authorize(...ROLE_GROUPS.ADMIN),
  idParam,
  controller.remove,
);

export default router;
