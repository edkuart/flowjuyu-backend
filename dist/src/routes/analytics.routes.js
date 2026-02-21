"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const analytics_controller_1 = require("../controllers/analytics.controller");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
const trackingLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
});
router.get("/top-products", analytics_controller_1.getTopViewedProducts);
router.post("/track/product/:productId", trackingLimiter, analytics_controller_1.trackProductView);
router.post("/track/seller/:sellerId", trackingLimiter, analytics_controller_1.trackSellerView);
router.get("/seller/analytics", (0, auth_1.requireRole)("seller"), analytics_controller_1.getSellerAnalyticsOverview);
exports.default = router;
