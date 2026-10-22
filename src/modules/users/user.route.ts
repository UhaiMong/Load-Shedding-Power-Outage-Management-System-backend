import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { validate } from "../../middleware/validate";
import * as controller from "./user.controller";
import { updateMeSchema } from "./user.validator";

const router = Router();
router.use(authenticate);
router.get("/me", controller.getMe);
router.patch("/me", validate({ body: updateMeSchema }), controller.updateMe);

export default router;
