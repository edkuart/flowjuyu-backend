// src/routes/notifications.routes.ts

import { Router } from "express";
import { verifyToken } from "../middleware/auth";
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../controllers/notifications.controller";

const router: ReturnType<typeof Router> = Router();

// All routes require a valid JWT (buyer role)
router.use(verifyToken(["buyer", "seller", "admin", "support"]));

router.get("/", getNotifications);

// IMPORTANT: read-all MUST be registered before /:id/read
// otherwise "read-all" would be captured as an :id param
router.patch("/read-all", markAllNotificationsRead);
router.patch("/:id/read", markNotificationRead);

export default router;
