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
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const Auth = __importStar(require("../controllers/auth.controller"));
const upload_middleware_1 = require("../middleware/upload.middleware");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
router.post("/register", Auth.register);
router.post("/login", Auth.login);
router.post("/register/seller", upload_middleware_1.uploadVendedorDocs, Auth.registerVendedor);
router.patch("/change-password", auth_1.requireAuth, (0, auth_1.requireRole)("seller", "buyer", "admin", "support"), Auth.changePassword);
router.post("/logout-all", auth_1.requireAuth, Auth.logoutAll);
router.post("/forgot-password", Auth.forgotPassword);
router.post("/reset-password", Auth.resetPassword);
const maybe = (name) => Auth[name];
if (maybe("loginWithGoogle")) {
    router.post("/login/google", maybe("loginWithGoogle"));
}
if (maybe("logout")) {
    router.post("/logout", maybe("logout"));
}
if (maybe("getSession")) {
    router.get("/session", maybe("getSession"));
}
exports.default = router;
