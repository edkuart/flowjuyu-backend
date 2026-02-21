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
const asyncHandler_1 = __importDefault(require("../utils/asyncHandler"));
const auth_1 = require("../middleware/auth");
const AdminController = __importStar(require("../controllers/admin.controller"));
const AdminTicketController = __importStar(require("../controllers/admin.ticket.controller"));
const AdminTicketStatsController = __importStar(require("../controllers/admin.ticket.stats.controller"));
const admin_seller_governance_controller_1 = require("../controllers/admin.seller.governance.controller");
const admin_controller_1 = require("../controllers/admin.controller");
const router = (0, express_1.Router)();
router.use((0, auth_1.verifyToken)(["admin"]), (0, auth_1.requireRole)("admin"));
router.get("/dashboard", (0, asyncHandler_1.default)(AdminController.getAdminDashboard));
router.get("/tickets/stats", (0, asyncHandler_1.default)(AdminTicketStatsController.getTicketStats));
router.get("/tickets", (0, asyncHandler_1.default)(AdminTicketController.getAllTickets));
router.get("/tickets/:id", (0, asyncHandler_1.default)(AdminTicketController.getTicketDetailAdmin));
router.patch("/tickets/:id/assign", (0, asyncHandler_1.default)(AdminTicketController.assignTicket));
router.patch("/tickets/:id/status", (0, asyncHandler_1.default)(AdminTicketController.changeTicketStatus));
router.post("/tickets/:id/reply", (0, asyncHandler_1.default)(AdminTicketController.replyToTicketAdmin));
router.patch("/tickets/:id/close", (0, asyncHandler_1.default)(AdminTicketController.closeTicket));
router.get("/sellers", (0, asyncHandler_1.default)(admin_seller_governance_controller_1.getAllSellers));
router.get("/sellers/:id", (0, asyncHandler_1.default)(admin_seller_governance_controller_1.getSellerDetail));
router.patch("/sellers/:id/approve", (0, asyncHandler_1.default)(admin_seller_governance_controller_1.approveSeller));
router.patch("/sellers/:id/reject", (0, asyncHandler_1.default)(admin_seller_governance_controller_1.rejectSeller));
router.patch("/sellers/:id/suspend", (0, asyncHandler_1.default)(admin_seller_governance_controller_1.suspendSeller));
router.patch("/sellers/:id/reactivate", (0, asyncHandler_1.default)(admin_seller_governance_controller_1.reactivateSeller));
router.patch("/sellers/:id/kyc-review", (0, asyncHandler_1.default)(admin_controller_1.reviewSellerKYC));
router.get("/products", (0, asyncHandler_1.default)(AdminController.getAllAdminProducts));
router.get("/products/:id", (0, asyncHandler_1.default)(AdminController.getAdminProductDetail));
exports.default = router;
