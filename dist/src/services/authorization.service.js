"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.can = can;
const db_1 = require("../config/db");
const sequelize_1 = require("sequelize");
async function can(user, action) {
    if (!user?.id)
        return false;
    switch (action) {
        case "create_product":
        case "activate_product": {
            const result = await db_1.sequelize.query(`
        SELECT estado_validacion
        FROM vendedor_perfil
        WHERE user_id = :userId
        `, {
                replacements: { userId: user.id },
                type: sequelize_1.QueryTypes.SELECT,
            });
            if (!result.length)
                return false;
            return result[0].estado_validacion === "aprobado";
        }
        case "edit_profile":
            return true;
        case "view_sensitive_data":
            return user.roles?.includes("admin");
        default:
            return false;
    }
}
