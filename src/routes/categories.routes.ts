// src/routes/categories.routes.ts

import { Router } from "express";
import asyncHandler from "../middleware/asyncHandler";
import { verifyToken, requireRole } from "../middleware/auth";

import {
  listCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory
} from "../controllers/categories.controller";

const router = Router();

/* =========================================
   PUBLIC
========================================= */

router.get("/", asyncHandler(listCategories));

router.get("/:idOrSlug", asyncHandler(getCategory));

/* =========================================
   ADMIN ONLY
========================================= */

router.post(
  "/",
  verifyToken(["admin"]),
  requireRole("admin"),
  asyncHandler(createCategory)
);

router.put(
  "/:id",
  verifyToken(["admin"]),
  requireRole("admin"),
  asyncHandler(updateCategory)
);

router.delete(
  "/:id",
  verifyToken(["admin"]),
  requireRole("admin"),
  asyncHandler(deleteCategory)
);

export default router;