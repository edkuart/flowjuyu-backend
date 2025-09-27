import { Router } from "express";
import path from "path";
import multer from "multer";

// Importa TODO el módulo para evitar desajustes de named exports
import * as Auth from "../controllers/auth.controller";

const router = Router();

// Multer básico para archivos de vendedor (si ya tienes uno, reemplázalo)
const upload = multer({ dest: path.join(process.cwd(), "uploads", "vendedores") });

// ---- Auth (comprador)
router.post("/register", Auth.register);
router.post("/login", Auth.login);

// Monta solo los handlers que existan para evitar errores de build
const maybe = (name: string) => (Auth as any)[name] as undefined | ((...a: any[]) => any);
const loginWithGoogle = maybe("loginWithGoogle");
const logout = maybe("logout");
const getSession = maybe("getSession");

if (typeof loginWithGoogle === "function") {
  router.post("/login/google", loginWithGoogle);
}
if (typeof logout === "function") {
  router.post("/logout", logout);
}
if (typeof getSession === "function") {
  router.get("/session", getSession);
}

// ---- Auth (vendedor)
router.post(
  "/register/seller",
  upload.fields([
    { name: "logo", maxCount: 1 },
    { name: "fotoDPIFrente", maxCount: 1 },
    { name: "fotoDPIReverso", maxCount: 1 },
    { name: "selfieConDPI", maxCount: 1 },
  ]),
  Auth.registerVendedor
);

export default router;
