import type { Rol } from "../middleware/auth";

declare global {
  namespace Express {
    interface UserPayload {
      id: number;
      correo?: string;
      role: Rol;          // 👈 usamos role como estándar
      roles?: Rol[];
    }

    interface Request {
      user?: UserPayload;
    }
  }
}

export {};