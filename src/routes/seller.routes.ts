import { Router } from "express";
import { verifyToken } from "../middleware/auth";
import {
  getSellerDashboard,
  getSellerProducts,
  getSellerOrders,
  getSellerProfile,
  updateSellerProfile,
  validateSellerBusiness,
} from "../controllers/seller.controller";

const router = Router();

router.get("/dashboard", verifyToken(["seller"]), getSellerDashboard);
router.get("/products", verifyToken(["seller"]), getSellerProducts);
router.get("/orders", verifyToken(["seller"]), getSellerOrders);
router.get("/profile", verifyToken(["seller"]), getSellerProfile);
router.post("/profile", verifyToken(["seller"]), updateSellerProfile);
router.post("/profile/business", verifyToken(["seller"]), validateSellerBusiness);

export default router;
