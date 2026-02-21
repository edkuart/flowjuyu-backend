"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Category = void 0;
const sequelize_1 = require("sequelize");
const db_1 = require("../config/db");
class Category extends sequelize_1.Model {
}
exports.Category = Category;
Category.init({
    id: { type: sequelize_1.DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    nombre: { type: sequelize_1.DataTypes.STRING, allowNull: false, unique: true },
    slug: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: false,
        unique: true,
        set(v) {
            const value = (v || this.getDataValue("nombre") || "")
                .toString()
                .trim()
                .toLowerCase()
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-+|-+$/g, "");
            this.setDataValue("slug", value || "cat-" + Date.now());
        },
    },
    parentId: { field: "parent_id", type: sequelize_1.DataTypes.INTEGER, allowNull: true },
}, { tableName: "categorias", sequelize: db_1.sequelize });
Category.hasMany(Category, { as: "children", foreignKey: "parentId" });
Category.belongsTo(Category, { as: "parent", foreignKey: "parentId" });
exports.default = Category;
