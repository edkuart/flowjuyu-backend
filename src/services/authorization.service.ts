// src/services/authorization.service.ts

import { sequelize } from "../config/db";
import { QueryTypes } from "sequelize";

type Action =
  | "create_product"
  | "activate_product"
  | "edit_profile"
  | "view_sensitive_data";

export async function can(user: any, action: Action): Promise<boolean> {
  if (!user?.id) return false;

  switch (action) {
    case "create_product":
    case "activate_product": {
      const result: any[] = await sequelize.query(
        `
        SELECT estado_validacion
        FROM vendedor_perfil
        WHERE user_id = :userId
        `,
        {
          replacements: { userId: user.id },
          type: QueryTypes.SELECT,
        }
      );

      if (!result.length) return false;

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
