"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTicketStats = void 0;
const db_1 = require("../config/db");
const sequelize_1 = require("sequelize");
const getTicketStats = async (_req, res) => {
    try {
        const resumen = await db_1.sequelize.query(`
      SELECT estado, COUNT(*)::int AS count
      FROM tickets
      GROUP BY estado
      `, { type: sequelize_1.QueryTypes.SELECT });
        const byType = await db_1.sequelize.query(`
      SELECT tipo, COUNT(*)::int AS count
      FROM tickets
      GROUP BY tipo
      `, { type: sequelize_1.QueryTypes.SELECT });
        const byPriority = await db_1.sequelize.query(`
      SELECT prioridad, COUNT(*)::int AS count
      FROM tickets
      GROUP BY prioridad
      `, { type: sequelize_1.QueryTypes.SELECT });
        const avgClose = await db_1.sequelize.query(`
      SELECT AVG(
        EXTRACT(EPOCH FROM ("closedAt" - "createdAt")) / 3600
      ) AS avg_hours
      FROM tickets
      WHERE estado = 'cerrado'
      `, { type: sequelize_1.QueryTypes.SELECT });
        res.json({
            ok: true,
            data: {
                resumen,
                avg_close_hours: avgClose[0]?.avg_hours ?? 0,
                por_tipo: byType,
                por_prioridad: byPriority,
            },
        });
    }
    catch (error) {
        console.error("getTicketStats error:", error);
        res.status(500).json({ message: "Error interno" });
    }
};
exports.getTicketStats = getTicketStats;
