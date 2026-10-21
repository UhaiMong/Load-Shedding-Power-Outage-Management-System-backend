import { Router } from "express";
import adminRoutes from "./modules/admin/admin.route";
import analyticsRoutes from "./modules/analytics/analytics.route";
import authRoutes from "./modules/auth/auth.route";
import billRoutes from "./modules/bill/bill.route";
import {
  areaRouter,
  feederRouter,
  substationRouter,
  zoneRouter,
} from "./modules/network/network.route";
import notificationRoutes from "./modules/notification/notification.route";
import outageRoutes from "./modules/outage/outage.route";
import paymentRoutes from "./modules/payment/payment.route";
import scheduleRoutes from "./modules/schedule/schedule.route";
import userRoutes from "./modules/users/user.route";

const router = Router();

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/zones", zoneRouter);
router.use("/substations", substationRouter);
router.use("/feeders", feederRouter);
router.use("/areas", areaRouter);
router.use("/schedules", scheduleRoutes);
router.use("/outages", outageRoutes);
router.use("/notifications", notificationRoutes);
router.use("/bills", billRoutes);
router.use("/payments", paymentRoutes);
router.use("/analytics", analyticsRoutes);
router.use("/admin", adminRoutes);

export default router;
