// src/types/express.d.ts

import "express";
declare module "express-serve-static-core" {
  interface Request {
    user?: {
      id: string | number;
      correo?: string;
      roles: Array<"buyer" | "seller" | "admin">;
    };
  }
}
