import { QueryInterface } from "sequelize";

module.exports = {
  async up(queryInterface: QueryInterface) {
    await queryInterface.sequelize.query(`
      DELETE FROM vendedor_perfil vp
      USING users u
      WHERE vp.user_id IS NOT NULL
      AND (u.id IS NULL OR vp.user_id NOT IN (SELECT id FROM users));
    `);

    await queryInterface.sequelize.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'vendedor_perfil_user_fk'
          AND table_name = 'vendedor_perfil'
        ) THEN
          ALTER TABLE vendedor_perfil DROP CONSTRAINT vendedor_perfil_user_fk;
        END IF;
      END$$;
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE vendedor_perfil
      ADD CONSTRAINT vendedor_perfil_user_fk
      FOREIGN KEY (user_id) REFERENCES users(id)
      ON UPDATE CASCADE ON DELETE CASCADE;
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS vendedor_perfil_user_id_idx
      ON vendedor_perfil (user_id);
    `);
  },

  async down(queryInterface: QueryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE vendedor_perfil DROP CONSTRAINT IF EXISTS vendedor_perfil_user_fk;
    `);

    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS vendedor_perfil_user_id_idx;
    `);
  },
};
