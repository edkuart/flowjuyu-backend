// src/routes/review.routes.ts

import { Router } from "express";
import {
  getSellerRating,
  getSellerReviews,
  createReview,
  deleteReview,
  getReviewResponseById,
  getSellerReviewInsightsHandler,
  putReview,
  reportReviewHandler,
  respondToReview,
  reviewLimiter,
  reviewVoteLimiter,
  unvoteReviewHandler,
  voteReviewHandler,
} from "../controllers/review.controller";
import { requireRole, verifyToken } from "../middleware/auth";

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

router.get("/:id/response", getReviewResponseById);

router.post(
  "/:id/respond",
  verifyToken(["seller"]),
  requireRole("seller"),
  respondToReview,
);

router.post(
  "/:id/report",
  verifyToken(["buyer", "seller"]),
  requireRole("buyer", "seller"),
  reviewLimiter,
  reportReviewHandler,
);

router.post(
  "/:id/vote",
  verifyToken(["buyer", "seller", "admin", "support"]),
  requireRole("buyer", "seller", "admin", "support"),
  reviewVoteLimiter,
  voteReviewHandler,
);

router.delete(
  "/:id/vote",
  verifyToken(["buyer", "seller", "admin", "support"]),
  requireRole("buyer", "seller", "admin", "support"),
  unvoteReviewHandler,
);

router.put(
  "/:id",
  verifyToken(["buyer"]),
  requireRole("buyer"),
  putReview,
);

router.delete(
  "/:id",
  verifyToken(["buyer"]),
  requireRole("buyer"),
  deleteReview,
);

router.get(
  "/seller/insights/me",
  verifyToken(["seller"]),
  requireRole("seller"),
  getSellerReviewInsightsHandler,
);

export default router;
