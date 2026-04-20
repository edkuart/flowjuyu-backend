// src/routes/collections.routes.ts

import { Router } from "express";
import asyncHandler from "../middleware/asyncHandler";
import { verifyToken, requireRole } from "../middleware/auth";
import { requireActiveSeller } from "../middleware/requireActiveSeller";
import * as CollectionsController from "../controllers/collections.controller";

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

export default router;
