import { Router } from "express";
import * as Auth from "../controllers/auth.controller";
import { uploadVendedorDocs } from "../middleware/upload.middleware";
import { requireAuth, requireRole } from "../middleware/auth";

const router: Router = Router();

// ===========================
// Auth (comprador)
// ===========================
router.post("/register", Auth.register);
router.post("/login", Auth.login);

// ===========================
// Handlers opcionales dinámicos (compatibilidad)
// ===========================
const maybe = (name: string) =>
  (Auth as any)[name] as undefined | ((...a: any[]) => any);

if (maybe("loginWithGoogle")) {
  router.post("/login/google", maybe("loginWithGoogle")!);
}

if (maybe("logout")) {
  router.post("/logout", maybe("logout")!);
}

if (maybe("getSession")) {
  router.get("/session", maybe("getSession")!);
}

// ===========================
// Auth (vendedor)
// ===========================
router.post(
  "/register/seller",
  uploadVendedorDocs,
  Auth.registerVendedor
);

// ===========================
// Seguridad
// ===========================
router.patch(
  "/change-password",
  requireRole("vendedor", "comprador", "admin", "soporte"),
  Auth.changePassword
);

router.post(
  "/logout-all",
  requireAuth,
  Auth.logoutAll
);

router.post("/forgot-password", Auth.forgotPassword);
router.post("/reset-password", Auth.resetPassword);

export default router;
