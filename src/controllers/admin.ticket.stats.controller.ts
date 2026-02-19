import { RequestHandler } from "express";
import { sequelize } from "../config/db";
import { QueryTypes } from "sequelize";

/* ======================================================
   📊 STATS DE TICKETS (ADMIN)
====================================================== */

interface TicketSummaryRow {
  total: number;
  abiertos: number;
  cerrados: number;
}

interface AvgCloseRow {
  avg_hours: number;
}

interface CountRow {
  tipo?: string;
  prioridad?: string;
  count: number;
}

export const getTicketStats: RequestHandler = async (_req, res) => {
  try {
    const resumen = await sequelize.query<CountRow>(
      `
      SELECT estado, COUNT(*)::int AS count
      FROM tickets
      GROUP BY estado
      `,
      { type: QueryTypes.SELECT }
    );

    const byType = await sequelize.query<CountRow>(
      `
      SELECT tipo, COUNT(*)::int AS count
      FROM tickets
      GROUP BY tipo
      `,
      { type: QueryTypes.SELECT }
    );

    const byPriority = await sequelize.query<CountRow>(
      `
      SELECT prioridad, COUNT(*)::int AS count
      FROM tickets
      GROUP BY prioridad
      `,
      { type: QueryTypes.SELECT }
    );

    const avgClose = await sequelize.query<AvgCloseRow>(
      `
      SELECT AVG(
        EXTRACT(EPOCH FROM ("closedAt" - "createdAt")) / 3600
      ) AS avg_hours
      FROM tickets
      WHERE estado = 'cerrado'
      `,
      { type: QueryTypes.SELECT }
    );

    res.json({
      ok: true,
      data: {
        resumen,
        avg_close_hours: avgClose[0]?.avg_hours ?? 0,
        por_tipo: byType,
        por_prioridad: byPriority,
      },
    });
  } catch (error) {
    console.error("getTicketStats error:", error);
    res.status(500).json({ message: "Error interno" });
  }
};

