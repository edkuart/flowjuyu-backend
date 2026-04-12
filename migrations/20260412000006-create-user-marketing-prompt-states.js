module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("user_marketing_prompt_states", {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "users", key: "id" },
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      },
      prompt_key: {
        type: Sequelize.STRING(120),
        allowNull: false,
      },
      status: {
        type: Sequelize.STRING(20),
        allowNull: false,
      },
      shown_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      acted_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn("NOW"),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn("NOW"),
      },
    });

    await queryInterface.addIndex("user_marketing_prompt_states", ["user_id", "prompt_key"], {
      unique: true,
      name: "user_marketing_prompt_states_user_prompt_idx",
    });

    await queryInterface.addIndex("user_marketing_prompt_states", ["prompt_key"], {
      name: "user_marketing_prompt_states_prompt_key_idx",
    });

    await queryInterface.addIndex("user_marketing_prompt_states", ["status"], {
      name: "user_marketing_prompt_states_status_idx",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("user_marketing_prompt_states");
  },
};
