import { Request, Response } from "express";
import Category from "../models/category.model";

export async function listCategories(req: Request, res: Response) {
  try {
    const { tree } = req.query;
    if (tree) {
      // árbol (parent + children)
      const roots = await Category.findAll({
        where: { parentId: null },
        include: [
          {
            model: Category,
            as: "children",
            include: [{ model: Category, as: "children" }],
          },
        ],
        order: [["nombre", "ASC"]],
      });
      return res.json(roots);
    } else {
      const rows = await Category.findAll({ order: [["nombre", "ASC"]] });
      return res.json(rows);
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}

export async function getCategory(req: Request, res: Response) {
  const { idOrSlug } = req.params;
  const where = isNaN(Number(idOrSlug))
    ? { slug: idOrSlug }
    : { id: Number(idOrSlug) };
  const row = await Category.findOne({ where });
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json(row);
}

// Admin-only en producción
export async function createCategory(req: Request, res: Response) {
  const { nombre, slug, parentId } = req.body;
  const row = await Category.create({
    nombre,
    slug,
    parentId: parentId ?? null,
  });
  res.status(201).json(row);
}

export async function updateCategory(req: Request, res: Response) {
  const idParam = req.params.id;
  const idRaw = Array.isArray(idParam) ? idParam[0] : idParam;
  const categoryId = Number(idRaw);

  if (!categoryId || Number.isNaN(categoryId)) {
    return res.status(400).json({ error: "ID inválido" });
  }

  const row = await Category.findByPk(categoryId);
  if (!row) return res.status(404).json({ error: "Not found" });

  const { nombre, slug, parentId } = req.body;

  await row.update({
    nombre,
    slug,
    parentId: parentId ?? null,
  });

  res.json(row);
}

export async function deleteCategory(req: Request, res: Response) {
  const idParam = req.params.id;
  const idRaw = Array.isArray(idParam) ? idParam[0] : idParam;
  const categoryId = Number(idRaw);

  if (!categoryId || Number.isNaN(categoryId)) {
    return res.status(400).json({ error: "ID inválido" });
  }

  const n = await Category.destroy({
    where: { id: categoryId },
  });

  res.json({ deleted: n > 0 });
}
