//src/controllers/seller.dashboard.controller.ts

import { Request, Response } from "express";
import { sequelize } from "../config/db";
import { QueryTypes } from "sequelize";

export const getSellerDashboard = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const user: any = (req as any).user;

    if (!user?.id) {
      res.status(401).json({ message: "No autenticado" });
      return;
    }

    const vendedorId = user.id;

    const query = `
      SELECT
        COUNT(*)::int AS total_productos,
        COUNT(*) FILTER (WHERE activo = true)::int AS activos,
        COUNT(*) FILTER (WHERE activo = false)::int AS inactivos,
        COUNT(*) FILTER (WHERE stock < 5 AND activo = true)::int AS stock_bajo
      FROM productos
      WHERE vendedor_id = :vendedorId
    `;

    const rows: any = await sequelize.query(query, {
      replacements: { vendedorId },
      type: QueryTypes.SELECT,
    });

    const stats = rows[0] || {
      total_productos: 0,
      activos: 0,
      inactivos: 0,
      stock_bajo: 0,
    };

    res.json(stats);
  } catch (error) {
    console.error("Error en getSellerDashboard:", error);
    res.status(500).json({
      message: "Error al obtener dashboard del vendedor",
    });
  }
};
