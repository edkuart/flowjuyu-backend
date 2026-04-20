// src/routes/notifications.routes.ts

import { Router } from "express";
import { verifyToken } from "../middleware/auth";
import {
  streamNotifications,
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../controllers/notifications.controller";

const router: ReturnType<typeof Router> = Router();

// All routes require a valid JWT (cookie or Bearer header)
router.use(verifyToken(["buyer", "seller", "admin", "support"]));

// IMPORTANT: route registration order matters here.
//
//   /stream    — must come before /:id/read (no collision risk, but explicit is better)
//   /read-all  — must come before /:id/read to prevent "read-all" matching as :id
//   /:id/read  — catch-all param, always last

router.get("/stream",    streamNotifications);
router.get("/",          getNotifications);
router.patch("/read-all",      markAllNotificationsRead);
router.patch("/:id/read",      markNotificationRead);

export default router;
