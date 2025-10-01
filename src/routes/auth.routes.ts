// src/routes/auth.routes.ts

import { Router } from "express";
import path from "path";
import multer from "multer";

// Importamos TODO el controlador (para evitar errores de named exports)
import * as Auth from "../controllers/auth.controller";

// ✅ tipo explícito para evitar TS2742
const router: Router = Router();

// ===========================
// Configuración de Multer (archivos de vendedor)
// ===========================
const upload = multer({
  dest: path.join(process.cwd(), "uploads", "vendedores"),
});

// ===========================
// Auth (comprador)
// ===========================
router.post("/register", Auth.register);
router.post("/login", Auth.login);

// Monta handlers opcionales solo si existen en el controller
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
  upload.fields([
    { name: "logo", maxCount: 1 },
    { name: "fotoDPIFrente", maxCount: 1 },
    { name: "fotoDPIReverso", maxCount: 1 },
    { name: "selfieConDPI", maxCount: 1 },
  ]),
  Auth.registerVendedor,
);

export default router;
