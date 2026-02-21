import { Request, Response, NextFunction, RequestHandler } from "express";
import { sequelize } from "../config/db";
import { QueryTypes } from "sequelize";

export const requireActiveSeller: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const user: any = (req as any).user;

    if (!user?.id) {
      res.status(401).json({ message: "No autenticado" });
      return;
    }

    const perfil: any[] = await sequelize.query(
      `
      SELECT estado_validacion, estado_admin
      FROM vendedor_perfil
      WHERE user_id = :userId
      `,
      {
        replacements: { userId: user.id },
        type: QueryTypes.SELECT,
      }
    );

    if (!perfil.length) {
      res.status(403).json({
        message: "Perfil de vendedor no encontrado",
      });
      return;
    }

    const estado = perfil[0];

    // 🔒 Validación administrativa (operativa)
    if (estado.estado_admin !== "activo") {
      res.status(403).json({
        message: "Tu comercio no está activo",
      });
      return;
    }

    next();
  } catch (error) {
    console.error("Error requireActiveSeller:", error);
    res.status(500).json({
      message: "Error interno del servidor",
    });
  }
};