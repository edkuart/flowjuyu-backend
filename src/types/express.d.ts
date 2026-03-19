import type { Rol } from "../middleware/auth";

declare global {
  namespace Express {
    interface UserPayload {
      id:    number;
      email: string;
      role:  Rol;
    }

    interface Request {
      user?: UserPayload;
    }
  }
}

export {};
