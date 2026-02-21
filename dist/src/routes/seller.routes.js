"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const asyncHandler_1 = __importDefault(require("../utils/asyncHandler"));
const auth_1 = require("../middleware/auth");
const requireActiveSeller_1 = require("../middleware/requireActiveSeller");
const SellerController = __importStar(require("../controllers/seller.controller"));
const SellerTicketController = __importStar(require("../controllers/sellerTicket.controller"));
const router = (0, express_1.Router)();
const storage = multer_1.default.memoryStorage();
const upload = (0, multer_1.default)({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (!/^image\/(png|jpe?g|webp|avif)$/.test(file.mimetype)) {
            return cb(new Error("Solo se permiten imágenes (png, jpg, webp, avif)"));
        }
        cb(null, true);
    },
});
router.get("/sellers/top", (0, asyncHandler_1.default)(SellerController.getTopSellers));
router.get("/tiendas", (0, asyncHandler_1.default)(SellerController.getSellers));
router.use((0, auth_1.verifyToken)(["seller"]), (0, auth_1.requireRole)("seller"));
router.get("/dashboard", requireActiveSeller_1.requireActiveSeller, (0, asyncHandler_1.default)(SellerController.getSellerDashboard));
router.get("/orders", requireActiveSeller_1.requireActiveSeller, (0, asyncHandler_1.default)(SellerController.getSellerOrders));
router.get("/profile", (0, asyncHandler_1.default)(SellerController.getSellerProfile));
router.patch("/profile", upload.single("logo"), (0, asyncHandler_1.default)(SellerController.updateSellerProfile));
router.post("/validar", upload.fields([
    { name: "foto_dpi_frente", maxCount: 1 },
    { name: "foto_dpi_reverso", maxCount: 1 },
    { name: "selfie_con_dpi", maxCount: 1 },
]), (0, asyncHandler_1.default)(SellerController.validateSellerBusiness));
router.get("/analytics", requireActiveSeller_1.requireActiveSeller, (0, asyncHandler_1.default)(SellerController.getSellerAnalytics));
router.get("/analytics/daily", requireActiveSeller_1.requireActiveSeller, (0, asyncHandler_1.default)(SellerController.getSellerAnalyticsDaily));
router.get("/account-status", (0, asyncHandler_1.default)(SellerController.getSellerAccountStatus));
router.post("/tickets", (0, asyncHandler_1.default)(SellerTicketController.createTicket));
router.get("/tickets", (0, asyncHandler_1.default)(SellerTicketController.getMyTickets));
router.get("/tickets/:id", (0, asyncHandler_1.default)(SellerTicketController.getMyTicketDetail));
router.post("/tickets/:id/reply", (0, asyncHandler_1.default)(SellerTicketController.replyToTicketSeller));
router.get("/:id", (0, asyncHandler_1.default)(SellerController.getSellerProfile));
exports.default = router;
