import { Model, Optional } from "sequelize";
interface CategoryAttrs {
    id: number;
    nombre: string;
    slug: string;
    parentId?: number | null;
    createdAt?: Date;
    updatedAt?: Date;
}
type CategoryCreationAttrs = Optional<CategoryAttrs, "id" | "slug" | "parentId">;
export declare class Category extends Model<CategoryAttrs, CategoryCreationAttrs> implements CategoryAttrs {
    id: number;
    nombre: string;
    slug: string;
    parentId: number | null;
    readonly createdAt: Date;
    readonly updatedAt: Date;
}
export default Category;
