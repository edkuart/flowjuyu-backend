// src/routes/buyer.routes.ts
import { Router } from "express";
import { requireRole } from "../middleware/auth";
import {
  getBuyerDashboard,
  getBuyerOrders,
  getBuyerProfile,
  updateBuyerProfile,

  // Direcciones
  createAddress,
  getAddresses,
  updateAddress,
  deleteAddress,

  // Favoritos
  getFavorites,
  addFavorite,
  removeFavorite,

  // Reviews
  getReviews,
  createReview,
  deleteReview,

  // Notificaciones
  getNotifications,
  updateNotificationSettings,

  // Tarjetas
  addCard,
  getCards,
  deleteCard,

  // Garantías / reclamos
  getWarranties,
  createWarrantyClaim,
} from "../controllers/buyer.controller";

const router: Router = Router();

// ===========================
// Panel general
// ===========================
router.get("/dashboard", requireRole("buyer"), getBuyerDashboard);

// ===========================
// Pedidos
// ===========================
router.get("/orders", requireRole("buyer"), getBuyerOrders);

// ===========================
// Perfil
// ===========================
router.get("/profile", requireRole("buyer"), getBuyerProfile);
router.put("/profile", requireRole("buyer"), updateBuyerProfile);

// ===========================
// Direcciones del comprador
// ===========================
router.post("/addresses", requireRole("buyer"), createAddress);
router.get("/addresses", requireRole("buyer"), getAddresses);
router.put("/addresses", requireRole("buyer"), updateAddress);
router.delete("/addresses/:id", requireRole("buyer"), deleteAddress);

// ===========================
// Favoritos
// ===========================
router.get("/favorites", requireRole("buyer"), getFavorites);
router.post("/favorites", requireRole("buyer"), addFavorite);
router.delete("/favorites/:id", requireRole("buyer"), removeFavorite);

// ===========================
// Reviews
// ===========================
router.get("/reviews", requireRole("buyer"), getReviews);
router.post("/reviews", requireRole("buyer"), createReview);
router.delete("/reviews/:id", requireRole("buyer"), deleteReview);

// ===========================
// Notificaciones
// ===========================
router.get("/notifications", requireRole("buyer"), getNotifications);
router.put("/notifications/settings", requireRole("buyer"), updateNotificationSettings);

// ===========================
// Tarjetas guardadas
// ===========================
router.get("/cards", requireRole("buyer"), getCards);
router.post("/cards", requireRole("buyer"), addCard);
router.delete("/cards/:id", requireRole("buyer"), deleteCard);

// ===========================
// Garantías / reclamos
// ===========================
router.get("/warranty", requireRole("buyer"), getWarranties);
router.post("/warranty", requireRole("buyer"), createWarrantyClaim);

export default router;
