import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export type Rol = "buyer" | "seller" | "admin";

interface DecodedToken {
  id: string;
  correo: string;
  rol: Rol;
  iat: number;
  exp: number;
}

export const verifyToken = (roles: Rol[] = []) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ message: "Token no proporcionado" });
      return;
    }

    const token = authHeader.split(" ")[1];

    try {
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET || "cortes_secret"
      ) as DecodedToken;

      if (roles.length > 0 && !roles.includes(decoded.rol)) {
        res.status(403).json({ message: "Acceso denegado por rol" });
        return;
      }

      (req as any).user = decoded;
      next();
    } catch (err) {
      res.status(403).json({ message: "Token inválido o expirado" });
    }
  };
};
