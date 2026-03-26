// src/routes/review.routes.ts

import { Router } from "express";
import {
  getSellerRating,
  getSellerReviews,
  createReview,
  reviewLimiter,
} from "../controllers/review.controller";

const router: ReturnType<typeof Router> = Router();

// Public — get seller rating summary
router.get("/seller/:sellerId/rating", getSellerRating);

// Public — list seller reviews
router.get("/seller/:sellerId", getSellerReviews);

// Public (rate-limited) — submit a review
router.post("/seller/:sellerId", reviewLimiter, createReview);

export default router;
