// src/routes/favorites.routes.ts
// Available to any authenticated user (buyer, seller, etc.)

import { Router } from "express";
import { verifyToken } from "../middleware/auth";
import {
  getFavorites,
  checkFavorite,
  addFavorite,
  removeFavorite,
  removeFavoriteByRef,
} from "../controllers/favorites.controller";

const router: ReturnType<typeof Router> = Router();

// All routes require a valid JWT (any role)
router.use(verifyToken(["buyer", "seller", "admin", "support"]));

router.get("/",        getFavorites);
router.get("/check",   checkFavorite);
router.post("/",       addFavorite);
router.delete("/ref",  removeFavoriteByRef);
router.delete("/:id",  removeFavorite);

export default router;
