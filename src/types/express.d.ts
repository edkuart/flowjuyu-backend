import type { Rol } from "../middleware/auth";

declare global {
  namespace Express {
    /**
     * Payload que se inyecta en req.user
     * después de pasar por verifyToken()
     */
    interface UserPayload {
      id: number | string;
      correo?: string;
      rol?: Rol;
      roles?: Rol[];
    }

    interface Request {
      user?: UserPayload;
    }
  }
}

export {};
