import { Router } from "express";
import { ROLE_GROUPS, Role } from "../../config/roles";
import { authenticate, authorize } from "../../middleware/authenticate";
import { validate } from "../../middleware/validate";
import * as controller from "./bill.controller";
import {
  createBillSchema,
  idParamSchema,
  listBillsQuery,
} from "./bill.validator";

const router = Router();
router.use(authenticate);

const viewers = authorize(Role.CUSTOMER, ...ROLE_GROUPS.BILLING);

router.post(
  "/",
  authorize(...ROLE_GROUPS.BILLING),
  validate({ body: createBillSchema }),
  controller.create,
);
router.get("/", viewers, validate({ query: listBillsQuery }), controller.list);
router.get(
  "/:id",
  viewers,
  validate({ params: idParamSchema }),
  controller.getById,
);
router.delete(
  "/:id",
  authorize(...ROLE_GROUPS.ADMIN),
  validate({ params: idParamSchema }),
  controller.remove,
);

export default router;
