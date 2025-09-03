import { DataTypes, Model, Optional } from "sequelize"
import { sequelize } from "../config/db"

// Atributos del producto
interface ProductAttributes {
  id: string
  vendedor_id: number
  nombre: string
  descripcion?: string | null
  precio: number
  stock: number
  categoria_id?: number | null
  clase_id: number
  tela_id?: number | null
  region_id?: number | null
  imagen_url?: string | null
  activo: boolean
  categoria_custom?: string | null
  region_custom?: string | null
  tela_custom?: string | null
  created_at?: Date
  updated_at?: Date
}

// Para creación → algunos campos son opcionales
type ProductCreation = Optional<
  ProductAttributes,
  | "id"
  | "activo"
  | "stock"
  | "descripcion"
  | "categoria_id"
  | "tela_id"
  | "region_id"
  | "imagen_url"
  | "categoria_custom"
  | "region_custom"
  | "tela_custom"
  | "created_at"
  | "updated_at"
>

class Product extends Model<ProductAttributes, ProductCreation>
  implements ProductAttributes {
  public id!: string
  public vendedor_id!: number
  public nombre!: string
  public descripcion?: string | null
  public precio!: number
  public stock!: number
  public categoria_id?: number | null
  public clase_id!: number
  public tela_id?: number | null
  public region_id?: number | null
  public imagen_url?: string | null
  public activo!: boolean
  public categoria_custom?: string | null
  public region_custom?: string | null
  public tela_custom?: string | null
  public readonly created_at!: Date
  public readonly updated_at!: Date
}

Product.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    vendedor_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    nombre: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    descripcion: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    precio: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    stock: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    categoria_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    clase_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    tela_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    region_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    imagen_url: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    activo: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    categoria_custom: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    region_custom: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    tela_custom: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    created_at: DataTypes.DATE,
    updated_at: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: "Producto",
    tableName: "productos",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
)

export default Product
