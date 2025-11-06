import { Router } from "express";
import * as Auth from "../controllers/auth.controller";
import { uploadVendedorDocs } from "../middleware/upload.middleware";

//  Router explícito
const router: Router = Router();

// ===========================
// Auth (comprador)
// ===========================
router.post("/register", Auth.register);
router.post("/login", Auth.login);

// Handlers opcionales dinámicos (compatibilidad)
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
// Usa el middleware centralizado para manejar los archivos
router.post("/register/seller", uploadVendedorDocs, Auth.registerVendedor);

export default router;
