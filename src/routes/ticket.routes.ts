import { Router } from "express";
import { createTicket, getAllTickets, updateTicketStatus } from "../controllers/ticket.controller";
import { requireAuth } from "../middleware/auth";

const router = Router();

// Crear ticket: compradores y vendedores
router.post("/", requireAuth(["comprador", "vendedor"]), createTicket);

// Ver todos los tickets: SOLO SOPORTE + ADMIN
router.get("/", requireAuth(["soporte", "admin"]), getAllTickets);

// Cambiar estado: SOLO SOPORTE + ADMIN
router.put("/:id", requireAuth(["soporte", "admin"]), updateTicketStatus);

export default router;
