"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listCategories = listCategories;
exports.getCategory = getCategory;
exports.createCategory = createCategory;
exports.updateCategory = updateCategory;
exports.deleteCategory = deleteCategory;
const category_model_1 = __importDefault(require("../models/category.model"));
async function listCategories(req, res) {
    try {
        const { tree } = req.query;
        if (tree) {
            const roots = await category_model_1.default.findAll({
                where: { parentId: null },
                include: [
                    {
                        model: category_model_1.default,
                        as: "children",
                        include: [{ model: category_model_1.default, as: "children" }],
                    },
                ],
                order: [["nombre", "ASC"]],
            });
            return res.json(roots);
        }
        else {
            const rows = await category_model_1.default.findAll({ order: [["nombre", "ASC"]] });
            return res.json(rows);
        }
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
}
async function getCategory(req, res) {
    const { idOrSlug } = req.params;
    const where = isNaN(Number(idOrSlug))
        ? { slug: idOrSlug }
        : { id: Number(idOrSlug) };
    const row = await category_model_1.default.findOne({ where });
    if (!row)
        return res.status(404).json({ error: "Not found" });
    res.json(row);
}
async function createCategory(req, res) {
    const { nombre, slug, parentId } = req.body;
    const row = await category_model_1.default.create({
        nombre,
        slug,
        parentId: parentId ?? null,
    });
    res.status(201).json(row);
}
async function updateCategory(req, res) {
    const { id } = req.params;
    const row = await category_model_1.default.findByPk(id);
    if (!row)
        return res.status(404).json({ error: "Not found" });
    const { nombre, slug, parentId } = req.body;
    await row.update({ nombre, slug, parentId: parentId ?? null });
    res.json(row);
}
async function deleteCategory(req, res) {
    const { id } = req.params;
    const n = await category_model_1.default.destroy({ where: { id } });
    res.json({ deleted: n > 0 });
}
