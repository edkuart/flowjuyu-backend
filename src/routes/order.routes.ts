// src/routes/order.routes.ts

import { Router } from "express";
import asyncHandler from "../middleware/asyncHandler";
import { verifyToken } from "../middleware/auth";
import { createOrder, getMyOrders, getOrder } from "../controllers/order.controller";

const router: ReturnType<typeof Router> = Router();

// Create order from cart
router.post("/", verifyToken(["buyer"]), asyncHandler(createOrder));

// Get current buyer's order history
router.get("/my", verifyToken(["buyer"]), asyncHandler(getMyOrders));

// Get order by ID
router.get("/:id", verifyToken(["buyer", "seller", "admin"]), asyncHandler(getOrder));

export default router;
