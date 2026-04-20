// src/routes/follows.routes.ts

import { Router } from "express";
import { verifyToken } from "../middleware/auth";
import {
  followSeller,
  unfollowSeller,
  muteFollowedSeller,
  getFollowedSellers,
} from "../controllers/follows.controller";

const router: ReturnType<typeof Router> = Router();

// Only buyers can follow/unfollow sellers
router.use(verifyToken(["buyer"]));

// IMPORTANT: /sellers must be registered before /sellers/:sellerId
// to prevent "sellers" matching as :sellerId on GET.
router.get("/sellers",                  getFollowedSellers);
router.post("/sellers/:sellerId",        followSeller);
router.delete("/sellers/:sellerId",      unfollowSeller);
router.patch("/sellers/:sellerId/mute",  muteFollowedSeller);

export default router;
