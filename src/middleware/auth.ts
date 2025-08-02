import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

interface DecodedToken {
  id: number;
  correo: string;
  rol: string;
  iat: number;
  exp: number;
}

export const verifyToken = (roles: string[] = []) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Token no proporcionado" });
    }

    const token = authHeader.split(" ")[1];

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || "cortes_secret") as DecodedToken;

      // Si se especifican roles, verifica que el usuario tenga uno válido
      if (roles.length > 0 && !roles.includes(decoded.rol)) {
        return res.status(403).json({ message: "Acceso denegado" });
      }

      // Guarda el usuario en la request para usarlo en controladores
      (req as any).user = decoded;

      next();
    } catch (err) {
      return res.status(403).json({ message: "Token inválido o expirado" });
    }
  };
};
