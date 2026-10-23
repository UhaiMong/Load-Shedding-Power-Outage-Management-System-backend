import { Router } from "express";
import { ROLE_GROUPS } from "../../config/roles.js";
import { authenticate, authorize } from "../../middleware/authenticate.js";
import { uploadImage } from "../../middleware/upload.js";
import { validate } from "../../middleware/validate.js";
import * as controller from "./user.controller.js";
import {
  availabilitySchema,
  listTechniciansQuery,
  updateMeSchema,
} from "./user.validator.js";

const router = Router();
router.use(authenticate);

router.get("/me", controller.getMe);
router.patch("/me", validate({ body: updateMeSchema }), controller.updateMe);
router.delete("/me", controller.deleteMe);
router.post("/me/avatar", uploadImage.single("image"), controller.uploadAvatar);

router.patch(
  "/me/availability",
  authorize(...ROLE_GROUPS.TECHNICIAN),
  validate({ body: availabilitySchema }),
  controller.setAvailability,
);
router.get(
  "/technicians",
  authorize(...ROLE_GROUPS.STAFF),
  validate({ query: listTechniciansQuery }),
  controller.listTechnicians,
);

export default router;
