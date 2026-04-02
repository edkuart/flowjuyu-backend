// src/routes/auth.routes.ts

import { Router } from "express";
import * as Auth from "../controllers/auth.controller";
import { uploadVendedorDocs, validateUploadedFiles } from "../middleware/upload.middleware";
import { requireAuth, requireRole } from "../middleware/auth";

const router: Router = Router();

// ======================================================
// 🔐 BUYER AUTH
// ======================================================

router.post("/register",          Auth.register);
router.post("/login",             Auth.login);

// ======================================================
// 🔐 SELLER AUTH (KYC multipart)
// ======================================================

router.post("/register/seller",   uploadVendedorDocs, validateUploadedFiles, Auth.registerVendedor);

// ======================================================
// 🔐 SOCIAL LOGIN
// Explicitly defined — returns 501 until Phase 2 implementation.
// Replacing the old maybe() pattern that silently dropped routes.
// ======================================================

router.post("/login/google",      Auth.loginWithGoogle);  // backward-compat
router.post("/auth/social",       Auth.loginWithSocial);   // unified endpoint

// ======================================================
// 🔐 SESSION
// Explicitly defined stubs — returns 501 until Phase 2.
// ======================================================

router.post("/logout",            Auth.logout);
router.post("/refresh",           Auth.refresh);
router.get("/session",            Auth.getSession);

// ======================================================
// 🔐 PASSWORD & SECURITY
// ======================================================

router.patch(
  "/change-password",
  requireAuth,
  requireRole("seller", "buyer", "admin", "support"),
  Auth.changePassword
);

router.post("/logout-all",        requireAuth, Auth.logoutAll);
router.post("/forgot-password",   Auth.forgotPassword);
router.post("/reset-password",    Auth.resetPassword);

export default router;
