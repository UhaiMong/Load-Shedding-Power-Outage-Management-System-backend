import { Router } from "express";
import { authenticate, authorize } from "../../middleware/authenticate";
import { validate } from "../../middleware/validate";
import * as controller from "./user.controller";
import {
  availabilitySchema,
  listTechniciansQuery,
  updateMeSchema,
} from "./user.validator";
import { uploadImage } from "../../middleware/upload";

const router = Router();
router.use(authenticate);

router.get("/me", controller.getMe);
router.patch("/me", validate({ body: updateMeSchema }), controller.updateMe);
router.delete("/me", controller.deleteMe);
router.post("/me/avatar", uploadImage.single("image"), controller.uploadAvatar);

router.patch(
  "/me/availability",
  validate({ body: availabilitySchema }),
  controller.setAvailability,
);
router.get(
  "/technicians",
  validate({ query: listTechniciansQuery }),
  controller.listTechnicians,
);

export default router;
