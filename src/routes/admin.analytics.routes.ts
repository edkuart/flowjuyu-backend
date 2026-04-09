import { Router } from "express";
import asyncHandler from "../middleware/asyncHandler";
import { requireRole, verifyToken } from "../middleware/auth";
import {
  getAdminAnalyticsConversion,
  getAdminAnalyticsFunnel,
  getAdminAnalyticsTimeseries,
} from "../controllers/admin.analytics.controller";

const router: ReturnType<typeof Router> = Router();

router.use(verifyToken(["admin"]), requireRole("admin"));

router.get("/funnel", asyncHandler(getAdminAnalyticsFunnel));
router.get("/conversion", asyncHandler(getAdminAnalyticsConversion));
router.get("/timeseries", asyncHandler(getAdminAnalyticsTimeseries));

export default router;
