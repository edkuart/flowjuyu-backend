// src/routes/seller.routes.ts

import { Router } from "express";
import { requireRole } from "../middleware/auth";
import {
  getSellerDashboard,
  getSellerProducts,
  getSellerOrders,
  getSellerProfile,
  updateSellerProfile,
  validateSellerBusiness,
} from "../controllers/seller.controller";

const router: Router = Router(); // 👈 tipo explícito

// ===========================
// Rutas de Seller (autenticado con rol seller)
// ===========================
router.get("/dashboard", requireRole("seller"), getSellerDashboard);
router.get("/products", requireRole("seller"), getSellerProducts);
router.get("/orders", requireRole("seller"), getSellerOrders);
router.get("/profile", requireRole("seller"), getSellerProfile);
router.post("/profile", requireRole("seller"), updateSellerProfile);
router.post("/profile/business", requireRole("seller"), validateSellerBusiness);

export default router;
