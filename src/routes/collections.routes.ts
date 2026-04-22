// src/routes/collections.routes.ts

import { Router } from "express";
import multer from "multer";
import asyncHandler from "../middleware/asyncHandler";
import { verifyToken, requireRole } from "../middleware/auth";
import { requireActiveSeller } from "../middleware/requireActiveSeller";
import * as CollectionsController from "../controllers/collections.controller";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

const router: ReturnType<typeof Router> = Router();

/* ==================================================
   🌍 RUTAS PÚBLICAS
   (SIEMPRE PRIMERO)
================================================== */

// by numeric seller user_id (used by the store frontend)
router.get(
  "/public/seller/:sellerId",
  asyncHandler(CollectionsController.getPublicCollectionsBySellerId)
);

// by slug (legacy / direct link)
router.get(
  "/public/:slug",
  asyncHandler(CollectionsController.getPublicCollections)
);

router.get(
  "/templates",
  asyncHandler(CollectionsController.getPublicCollectionTemplates)
);

/* ==================================================
   🔐 RUTAS PRIVADAS (vendedor autenticado)
================================================== */

router.use(verifyToken(["seller"]));
router.use(requireRole("seller"));
router.use(requireActiveSeller);

// Collection CRUD
router.get(
  "/",
  asyncHandler(CollectionsController.getMyCollections)
);

router.get(
  "/templates/mine",
  asyncHandler(CollectionsController.getMyCollectionTemplates)
);

router.get(
  "/templates/:templateId",
  asyncHandler(CollectionsController.getCollectionTemplateById)
);

router.post(
  "/",
  asyncHandler(CollectionsController.createCollection)
);

router.get(
  "/:id",
  asyncHandler(CollectionsController.getCollectionById)
);

router.put(
  "/:id",
  asyncHandler(CollectionsController.updateCollection)
);

router.put(
  "/:id/products",
  asyncHandler(CollectionsController.setCollectionProducts)
);

router.patch(
  "/:id/publish",
  asyncHandler(CollectionsController.togglePublish)
);

router.delete(
  "/:id",
  asyncHandler(CollectionsController.deleteCollection)
);

// Canvas items
router.post(
  "/:id/items",
  asyncHandler(CollectionsController.addItem)
);

router.put(
  "/:id/items/:itemId",
  asyncHandler(CollectionsController.updateItem)
);

router.delete(
  "/:id/items/:itemId",
  asyncHandler(CollectionsController.removeItem)
);

// Image upload for canvas elements
router.post(
  "/:id/images",
  upload.single("image"),
  asyncHandler(CollectionsController.uploadCollectionImage)
);

router.post(
  "/:id/templates",
  asyncHandler(CollectionsController.saveCollectionAsTemplate)
);

router.post(
  "/:id/apply-template",
  asyncHandler(CollectionsController.applyCollectionTemplate)
);

export default router;
