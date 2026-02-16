import { Rol } from "../middleware/auth";

declare global {
  namespace Express {
    interface UserPayload {
      id: string | number;
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