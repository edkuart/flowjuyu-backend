// src/routes/review.routes.ts

import { Router } from "express";
import {
  getSellerRating,
  getSellerReviews,
  createReview,
  reviewLimiter,
} from "../controllers/review.controller";
import { requireRole } from "../middleware/auth";

const router: ReturnType<typeof Router> = Router();

// Public — get seller rating summary
router.get("/seller/:sellerId/rating", getSellerRating);

// Public — list seller reviews
router.get("/seller/:sellerId", getSellerReviews);

// Authenticated buyers only — submit a review
// requireRole("buyer") runs before reviewLimiter so unauthenticated requests
// are rejected with 401 before hitting the rate-limit counter.
router.post(
  "/seller/:sellerId",
  requireRole("buyer"),
  reviewLimiter,
  createReview,
);

export default router;
