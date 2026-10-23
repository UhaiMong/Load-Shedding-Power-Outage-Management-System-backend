import { Router } from "express";
import adminRoutes from "./modules/admin/admin.route.js";
import analyticsRoutes from "./modules/analytics/analytics.route.js";
import authRoutes from "./modules/auth/auth.route.js";
import billRoutes from "./modules/bill/bill.route.js";
import {
	areaRouter,
	feederRouter,
	substationRouter,
	zoneRouter,
} from "./modules/network/network.route.js";
import notificationRoutes from "./modules/notification/notification.route.js";
import outageRoutes from "./modules/outage/outage.route.js";
import paymentRoutes from "./modules/payment/payment.route.js";
import scheduleRoutes from "./modules/schedule/schedule.route.js";
import userRoutes from "./modules/users/user.route.js";

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
