import { Router } from "express";
import asyncHandler from "../utils/asyncHandler";
import { verifyToken, requireRole } from "../middleware/auth";
import * as AdminTicketController from "../controllers/admin.ticket.controller";

const router = Router();

/* ===============================
   🔐 MIDDLEWARE ADMIN
=============================== */
router.use(
  verifyToken(["admin"]),
  requireRole("admin")
);

/* ===============================
   🎫 TICKETS (ADMIN)
=============================== */

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

// responder
router.post(
  "/tickets/:id/reply",
  asyncHandler(AdminTicketController.replyToTicketAdmin)
);

// cambiar estado
router.patch(
  "/tickets/:id/status",
  asyncHandler(AdminTicketController.changeTicketStatus)
);

// asignar ticket
router.patch(
  "/tickets/:id/assign",
  asyncHandler(AdminTicketController.assignTicket)
);

// cerrar ticket
router.patch(
  "/tickets/:id/close",
  asyncHandler(AdminTicketController.closeTicket)
  );
  
export default router;
