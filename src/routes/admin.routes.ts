import { Router } from "express";
import asyncHandler from "../utils/asyncHandler";
import { verifyToken, requireRole } from "../middleware/auth";

// controllers
import * as AdminController from "../controllers/admin.controller";
import * as AdminTicketController from "../controllers/admin.ticket.controller";
import * as AdminTicketStatsController from "../controllers/admin.ticket.stats.controller";

const router = Router();

/* ===============================
   🔐 MIDDLEWARE ADMIN GLOBAL
=============================== */
router.use(
  verifyToken(["admin"]),
  requireRole("admin")
);

/* ===============================
   📊 DASHBOARD
=============================== */
router.get(
  "/dashboard",
  asyncHandler(AdminController.getAdminDashboard)
);

/* ===============================
   🎫 TICKETS (ADMIN)
   ⚠️ ORDEN CRÍTICO
=============================== */

// 📊 STATS — SIEMPRE PRIMERO
router.get(
  "/tickets/stats",
  asyncHandler(AdminTicketStatsController.getTicketStats)
);

// listar todos
router.get(
  "/tickets",
  asyncHandler(AdminTicketController.getAllTickets)
);

// detalle (después de stats)
router.get(
  "/tickets/:id",
  asyncHandler(AdminTicketController.getTicketDetailAdmin)
);

// asignar ticket
router.patch(
  "/tickets/:id/assign",
  asyncHandler(AdminTicketController.assignTicket)
);

// cambiar estado
router.patch(
  "/tickets/:id/status",
  asyncHandler(AdminTicketController.changeTicketStatus)
);

// responder ticket
router.post(
  "/tickets/:id/reply",
  asyncHandler(AdminTicketController.replyToTicketAdmin)
);

// cerrar ticket
router.patch(
  "/tickets/:id/close",
  asyncHandler(AdminTicketController.closeTicket)
);

export default router;
