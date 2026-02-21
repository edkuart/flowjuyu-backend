"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireActiveSeller = void 0;
const db_1 = require("../config/db");
const sequelize_1 = require("sequelize");
const requireActiveSeller = async (req, res, next) => {
    try {
        const user = req.user;
        if (!user?.id) {
            res.status(401).json({ message: "No autenticado" });
            return;
        }
        const perfil = await db_1.sequelize.query(`
      SELECT estado_validacion, estado_admin
      FROM vendedor_perfil
      WHERE user_id = :userId
      `, {
            replacements: { userId: user.id },
            type: sequelize_1.QueryTypes.SELECT,
        });
        if (!perfil.length) {
            res.status(403).json({
                message: "Perfil de vendedor no encontrado",
            });
            return;
        }
        const estado = perfil[0];
        if (estado.estado_admin !== "activo") {
            res.status(403).json({
                message: "Tu comercio no está activo",
            });
            return;
        }
        next();
    }
    catch (error) {
        console.error("Error requireActiveSeller:", error);
        res.status(500).json({
            message: "Error interno del servidor",
        });
    }
};
exports.requireActiveSeller = requireActiveSeller;
