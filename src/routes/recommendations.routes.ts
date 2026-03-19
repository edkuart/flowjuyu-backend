// src/routes/recommendations.routes.ts

import { Router } from "express";
import { verifyToken } from "../middleware/auth";
import { getRecommendedProducts } from "../controllers/recommendations.controller";

const router = Router();

// Requires any authenticated role — token carries personalization context
router.get(
  "/recommended",
  verifyToken(["buyer", "seller", "admin", "support"]),
  getRecommendedProducts
);

export default router;
