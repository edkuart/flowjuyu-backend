"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Migración: Renombrar columna email → correo en vendedor_perfil
 * Compatible con sequelize-cli 6.x y TypeScript.
 */
module.exports = {
    async up(queryInterface, sequelize) {
        await queryInterface.sequelize.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'vendedor_perfil'
          AND column_name = 'email'
        ) THEN
          ALTER TABLE vendedor_perfil RENAME COLUMN email TO correo;
        END IF;
      END
      $$;
    `);
        console.log("✅ Columna 'email' renombrada a 'correo'");
    },
    async down(queryInterface, sequelize) {
        await queryInterface.sequelize.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'vendedor_perfil'
          AND column_name = 'correo'
        ) THEN
          ALTER TABLE vendedor_perfil RENAME COLUMN correo TO email;
        END IF;
      END
      $$;
    `);
        console.log("↩️ Columna 'correo' revertida a 'email'");
    },
};
