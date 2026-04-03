import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "../config/db";

interface CategoryAttrs {
  id: number;
  nombre: string;
  slug: string;
  parentId?: number | null;
  nombre_kiche?: string | null;
  nombre_kaqchikel?: string | null;
  nombre_qeqchi?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}
type CategoryCreationAttrs = Optional<
  CategoryAttrs,
  "id" | "slug" | "parentId" | "nombre_kiche" | "nombre_kaqchikel" | "nombre_qeqchi"
>;

export class Category
  extends Model<CategoryAttrs, CategoryCreationAttrs>
  implements CategoryAttrs
{
  public id!: number;
  public nombre!: string;
  public slug!: string;
  public parentId!: number | null;
  public nombre_kiche!: string | null;
  public nombre_kaqchikel!: string | null;
  public nombre_qeqchi!: string | null;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Category.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    nombre: { type: DataTypes.STRING, allowNull: false, unique: true },
    slug: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      set(this: Category, v: string) {
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
    parentId: { field: "parent_id", type: DataTypes.INTEGER, allowNull: true },
    nombre_kiche:     { type: DataTypes.STRING(255), allowNull: true },
    nombre_kaqchikel: { type: DataTypes.STRING(255), allowNull: true },
    nombre_qeqchi:    { type: DataTypes.STRING(255), allowNull: true },
  },
  { tableName: "categorias", sequelize },
);

Category.hasMany(Category, { as: "children", foreignKey: "parentId" });
Category.belongsTo(Category, { as: "parent", foreignKey: "parentId" });

export default Category;
