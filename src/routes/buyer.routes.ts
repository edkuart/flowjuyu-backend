// src/routes/buyer.routes.ts
import { Router } from "express";
import { requireRole } from "../middleware/auth";
import {
  getBuyerDashboard,
  getBuyerOrders,
  getBuyerProfile,
} from "../controllers/buyer.controller";

const router: Router = Router(); // 👈 tipo explícito

// ===========================
// Rutas de Buyer (autenticado con rol buyer)
// ===========================
router.get("/dashboard", requireRole("buyer"), getBuyerDashboard);
router.get("/orders", requireRole("buyer"), getBuyerOrders);
router.get("/profile", requireRole("buyer"), getBuyerProfile);

export default router;
