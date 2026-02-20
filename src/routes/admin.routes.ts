import { Router } from "express";
import asyncHandler from "../utils/asyncHandler";
import { verifyToken, requireRole } from "../middleware/auth";

// Controllers
import * as AdminController from "../controllers/admin.controller";
import * as AdminTicketController from "../controllers/admin.ticket.controller";
import * as AdminTicketStatsController from "../controllers/admin.ticket.stats.controller";
import {
  getAllSellers,
  getSellerDetail,
  approveSeller,
  rejectSeller,
  suspendSeller,
  reactivateSeller,
} from "../controllers/admin.seller.governance.controller";

const router = Router();

/* ===============================
   🔐 MIDDLEWARE ADMIN GLOBAL
   (Se aplica a TODAS las rutas)
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
   ⚠️ ORDEN IMPORTANTE
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

// detalle
router.get(
  "/tickets/:id",
  asyncHandler(AdminTicketController.getTicketDetailAdmin)
);

// asignar
router.patch(
  "/tickets/:id/assign",
  asyncHandler(AdminTicketController.assignTicket)
);

// cambiar estado
router.patch(
  "/tickets/:id/status",
  asyncHandler(AdminTicketController.changeTicketStatus)
);

// responder
router.post(
  "/tickets/:id/reply",
  asyncHandler(AdminTicketController.replyToTicketAdmin)
);

// cerrar
router.patch(
  "/tickets/:id/close",
  asyncHandler(AdminTicketController.closeTicket)
);

/* ===============================
   🏪 SELLER GOVERNANCE
=============================== */

// listar todos
router.get(
  "/sellers",
  asyncHandler(getAllSellers)
);

// detalle
router.get(
  "/sellers/:id",
  asyncHandler(getSellerDetail)
);

// aprobar
router.patch(
  "/sellers/:id/approve",
  asyncHandler(approveSeller)
);

// rechazar
router.patch(
  "/sellers/:id/reject",
  asyncHandler(rejectSeller)
);

// suspender
router.patch(
  "/sellers/:id/suspend",
  asyncHandler(suspendSeller)
);

// reactivar
router.patch(
  "/sellers/:id/reactivate",
  asyncHandler(reactivateSeller)
);

export default router;
