"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/buyer.routes.ts
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const buyer_controller_1 = require("../controllers/buyer.controller");
const router = (0, express_1.Router)();
// ===========================
// Rutas de Buyer (autenticado con rol buyer)
// ===========================
router.get("/dashboard", (0, auth_1.requireRole)("buyer"), buyer_controller_1.getBuyerDashboard);
router.get("/orders", (0, auth_1.requireRole)("buyer"), buyer_controller_1.getBuyerOrders);
router.get("/profile", (0, auth_1.requireRole)("buyer"), buyer_controller_1.getBuyerProfile);
exports.default = router;
