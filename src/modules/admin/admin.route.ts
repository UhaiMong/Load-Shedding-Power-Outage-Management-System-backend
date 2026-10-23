import { Router } from "express";
import { ROLE_GROUPS } from "../../config/roles.js";
import { authenticate, authorize } from "../../middleware/authenticate.js";
import { validate } from "../../middleware/validate.js";
import * as controller from "./admin.controller.js";
import {
  auditLogsQuery,
  createStaffSchema,
  idParamSchema,
  listUsersQuery,
  updateRoleSchema,
  updateStatusSchema,
} from "./admin.validator.js";

const router = Router();
router.use(authenticate, authorize(...ROLE_GROUPS.ADMIN));

router.get("/users", validate({ query: listUsersQuery }), controller.listUsers);
router.post(
  "/users",
  validate({ body: createStaffSchema }),
  controller.createStaff,
);
router.get(
  "/users/:id",
  validate({ params: idParamSchema }),
  controller.getUser,
);
router.patch(
  "/users/:id/role",
  validate({ params: idParamSchema, body: updateRoleSchema }),
  controller.updateRole,
);
router.patch(
  "/users/:id/status",
  validate({ params: idParamSchema, body: updateStatusSchema }),
  controller.setStatus,
);
router.delete(
  "/users/:id",
  validate({ params: idParamSchema }),
  controller.deleteUser,
);

router.get("/dashboard-stats", controller.dashboardStats);
router.get(
  "/audit-logs",
  validate({ query: auditLogsQuery }),
  controller.listAuditLogs,
);

export default router;
