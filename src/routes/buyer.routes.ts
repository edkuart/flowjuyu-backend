import { Router } from "express";
import { verifyToken } from "../middleware/auth";
import {
  getBuyerDashboard,
  getBuyerOrders,
  getBuyerProfile,
} from "../controllers/buyer.controller";

const router = Router();

router.get("/dashboard", verifyToken(["buyer"]), getBuyerDashboard);
router.get("/orders", verifyToken(["buyer"]), getBuyerOrders);
router.get("/profile", verifyToken(["buyer"]), getBuyerProfile);

export default router;
