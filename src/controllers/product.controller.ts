// src/controllers/product.controller.ts
import { Request, Response } from "express";
import { sequelize } from "../config/db";
import multer from "multer";
import supabase from "../lib/supabase";
import Product from "../models/product.model";
import { Op } from "sequelize";

// ===========================
// Multer config (imágenes producto)
// ===========================
const storage = multer.memoryStorage();
const fileFilter: multer.Options["fileFilter"] = (_req, file, cb) =>
  /^image\/(png|jpe?g|webp|gif|avif)$/.test(file.mimetype)
    ? cb(null, true)
    : cb(new Error("Solo imágenes permitidas"));

export const uploadProductImages = multer({
  storage,
  limits: { files: 9, fileSize: 5 * 1024 * 1024 },
  fileFilter,
});

// ===========================
// 📚 Catálogos Públicos
// ===========================
export const getCategorias = async (_req: Request, res: Response) => {
  try {
    const [rows] = await sequelize.query(`
      SELECT id, nombre, imagen_url
      FROM categorias
      ORDER BY nombre ASC
    `);
    res.json(rows);
  } catch (error) {
    console.error("Error al obtener categorías:", error);
    res.status(500).json({ message: "Error al obtener categorías" });
  }
};

export const getClases = async (_req: Request, res: Response) => {
  try {
    const [rows] = await sequelize.query(`
      SELECT id, nombre, alias
      FROM clases
      ORDER BY nombre ASC
    `);
    res.json(rows);
  } catch (error) {
    console.error("Error al obtener clases:", error);
    res.status(500).json({ message: "Error al obtener clases" });
  }
};

export const getRegiones = async (_req: Request, res: Response) => {
  try {
    const [rows] = await sequelize.query(`
      SELECT id, nombre
      FROM regiones
      ORDER BY nombre ASC
    `);
    res.json(rows);
  } catch (error) {
    console.error("Error al obtener regiones:", error);
    res.status(500).json({ message: "Error al obtener regiones" });
  }
};

export const getTelas = async (req: Request, res: Response) => {
  const claseId = Number(req.query.clase_id);
  if (!claseId) {
    res.status(400).json({ message: "clase_id requerido" });
    return;
  }

  try {
    const [rows] = await sequelize.query(
      `SELECT id, nombre FROM telas WHERE clase_id = :claseId ORDER BY nombre ASC`,
      { replacements: { claseId } }
    );
    res.json(rows);
  } catch (error) {
    console.error("Error al obtener telas:", error);
    res.status(500).json({ message: "Error al obtener telas" });
  }
};

// ===========================
// 🎨 Taxonomía de Accesorios
// ===========================
export const getAccesorios = async (req: Request, res: Response) => {
  try {
    const tipo = (req.query.tipo as string) || "normal";

    const [rows] = await sequelize.query(
      `SELECT id, nombre, categoria_tipo
       FROM accesorios
       WHERE categoria_tipo = :tipo
       ORDER BY nombre ASC`,
      { replacements: { tipo } }
    );

    res.json(rows);
  } catch (error) {
    console.error("Error en getAccesorios:", error);
    res.status(500).json({ message: "Error al obtener accesorios" });
  }
};

export const getAccesorioTipos = async (req: Request, res: Response) => {
  const accesorioId = Number(req.query.accesorio_id);
  if (!accesorioId) {
    res.status(400).json({ message: "accesorio_id requerido" });
    return;
  }

  try {
    const [rows] = await sequelize.query(
      `SELECT id, nombre FROM accesorio_tipos WHERE accesorio_id = :accesorioId ORDER BY nombre ASC`,
      { replacements: { accesorioId } }
    );

    res.json(rows);
  } catch (error) {
    console.error("Error al obtener tipos:", error);
    res.status(500).json({ message: "Error al obtener tipos de accesorio" });
  }
};

export const getAccesorioMateriales = async (req: Request, res: Response) => {
  const accesorioId = Number(req.query.accesorio_id);
  if (!accesorioId) {
    res.status(400).json({ message: "accesorio_id requerido" });
    return;
  }

  try {
    const [rows] = await sequelize.query(
      `SELECT id, nombre FROM accesorio_materiales WHERE accesorio_id = :accesorioId ORDER BY nombre ASC`,
      { replacements: { accesorioId } }
    );

    res.json(rows);
  } catch (error) {
    console.error("Error al obtener materiales:", error);
    res.status(500).json({ message: "Error al obtener materiales de accesorio" });
  }
};

// ===========================
// 🛒 Crear Producto
// ===========================
export const createProduct = async (req: Request, res: Response) => {
  try {
    const u: any = (req as any).user;
    const b = req.body;

    // Validaciones
    if (!b.nombre || !b.precio || !b.stock) {
      res.status(400).json({ message: "Campos obligatorios faltantes" });
      return;
    }

    const precio = Number(b.precio);
    const stock = Number(b.stock);

    if (!Number.isFinite(precio) || precio <= 0) {
      res.status(400).json({ message: "Precio inválido" });
      return;
    }

    if (!Number.isInteger(stock) || stock < 0) {
      res.status(400).json({ message: "Stock inválido" });
      return;
    }

    // Imágenes
    const files = (req.files as Express.Multer.File[]) || [];
    const urls: string[] = [];

    for (const f of files) {
      const filename = `products/${Date.now()}-${Math.random()}-${f.originalname}`;
      const { error } = await supabase.storage
        .from("productos")
        .upload(filename, f.buffer, { contentType: f.mimetype });

      if (error) throw error;

      const { data } = supabase.storage.from("productos").getPublicUrl(filename);
      urls.push(data.publicUrl);
    }

    const primera = urls[0] ?? null;

    const [inserted]: any = await sequelize.query(
      `
      INSERT INTO productos (
        vendedor_id, nombre, descripcion, precio, stock,
        categoria_id, categoria_custom,
        clase_id, tela_id, tela_custom,
        departamento, municipio, departamento_custom, municipio_custom,
        accesorio_id, accesorio_custom,
        accesorio_tipo_id, accesorio_tipo_custom,
        accesorio_material_id, accesorio_material_custom,
        imagen_url, activo, created_at, updated_at
      ) VALUES (
        :vendedor_id, :nombre, :descripcion, :precio, :stock,
        :categoria_id, :categoria_custom,
        :clase_id, :tela_id, :tela_custom,
        :departamento, :municipio, :departamento_custom, :municipio_custom,
        :accesorio_id, :accesorio_custom,
        :accesorio_tipo_id, :accesorio_tipo_custom,
        :accesorio_material_id, :accesorio_material_custom,
        :imagen_url, :activo, now(), now()
      ) RETURNING id`,
      {
        replacements: {
          vendedor_id: u.id,
          nombre: b.nombre,
          descripcion: b.descripcion || null,
          precio,
          stock,

          categoria_id: b.categoria_id || null,
          categoria_custom: b.categoria_custom || null,

          clase_id: b.clase_id || null,
          tela_id: b.tela_id || null,
          tela_custom: b.tela_custom || null,

          departamento: b.departamento || null,
          municipio: b.municipio || null,
          departamento_custom: b.departamento_custom || null,
          municipio_custom: b.municipio_custom || null,

          accesorio_id: b.accesorio_id || null,
          accesorio_custom: b.accesorio_custom || null,

          accesorio_tipo_id: b.accesorio_tipo_id || null,
          accesorio_tipo_custom: b.accesorio_tipo_custom || null,

          accesorio_material_id: b.accesorio_material_id || null,
          accesorio_material_custom: b.accesorio_material_custom || null,

          imagen_url: primera,
          activo: Boolean(b.activo),
        },
      }
    );

    res.status(201).json({ id: inserted[0].id, imagenes: urls });
  } catch (error) {
    console.error("Error en createProduct:", error);
    res.status(500).json({ message: "Error al crear producto" });
  }
};

// ===========================
// 🛒 Productos del vendedor
// ===========================
export const getSellerProducts = async (req: Request, res: Response) => {
  try {
    const u: any = (req as any).user;

    const [rows] = await sequelize.query(
      `SELECT id, nombre, precio, stock, activo, imagen_url
       FROM productos
       WHERE vendedor_id = :vid
       ORDER BY created_at DESC`,
      { replacements: { vid: u.id } }
    );

    res.json(rows);
  } catch (error) {
    console.error("Error al obtener productos:", error);
    res.status(500).json({ message: "Error al obtener productos" });
  }
};

// ===========================
// Obtener producto por ID
// ===========================
export const getProductById = async (req: Request, res: Response) => {
  try {
    const u: any = (req as any).user;

    const [rows]: any = await sequelize.query(
      `
      SELECT *
      FROM productos
      WHERE id = :id
      AND vendedor_id = :vid
    `,
      { replacements: { id: req.params.id, vid: u.id } }
    );

    if (!rows.length) {
      res.status(404).json({ message: "Producto no encontrado" });
      return;
    }

    res.json(rows[0]);
  } catch (error) {
    console.error("Error al obtener producto:", error);
    res.status(500).json({ message: "Error al obtener producto" });
  }
};

// ===========================
// Actualizar producto
// ===========================
export const updateProduct = async (req: Request, res: Response) => {
  try {
    const u: any = (req as any).user;
    const b = req.body;

    const [rows] = await sequelize.query(
      `
      SELECT id
      FROM productos
      WHERE id = :id
      AND vendedor_id = :vid
    `,
      { replacements: { id: req.params.id, vid: u.id } }
    );

    if (!rows.length) {
      res.status(404).json({ message: "Producto no encontrado" });
      return;
    }

    const precio = Number(b.precio);
    const stock = Number(b.stock);

    const activo =
      b.activo === "true" ||
      b.activo === true ||
      b.activo === "1" ||
      b.activo === 1;

    await sequelize.query(
      `
      UPDATE productos SET
        nombre = :nombre,
        descripcion = :descripcion,
        precio = :precio,
        stock = :stock,
        categoria_id = :categoria_id,
        categoria_custom = :categoria_custom,
        clase_id = :clase_id,
        tela_id = :tela_id,
        tela_custom = :tela_custom,
        departamento = :departamento,
        municipio = :municipio,
        departamento_custom = :departamento_custom,
        municipio_custom = :municipio_custom,
        accesorio_id = :accesorio_id,
        accesorio_custom = :accesorio_custom,
        accesorio_tipo_id = :accesorio_tipo_id,
        accesorio_tipo_custom = :accesorio_tipo_custom,
        accesorio_material_id = :accesorio_material_id,
        accesorio_material_custom = :accesorio_material_custom,
        activo = :activo,
        updated_at = now()
      WHERE id = :id
      AND vendedor_id = :vid
    `,
      {
        replacements: {
          id: req.params.id,
          vid: u.id,

          nombre: b.nombre,
          descripcion: b.descripcion || null,
          precio,
          stock,

          categoria_id: b.categoria_id || null,
          categoria_custom: b.categoria_custom || null,

          clase_id: b.clase_id || null,
          tela_id: b.tela_id || null,
          tela_custom: b.tela_custom || null,

          departamento: b.departamento || null,
          municipio: b.municipio || null,
          departamento_custom: b.departamento_custom || null,
          municipio_custom: b.municipio_custom || null,

          accesorio_id: b.accesorio_id || null,
          accesorio_custom: b.accesorio_custom || null,
          accesorio_tipo_id: b.accesorio_tipo_id || null,
          accesorio_tipo_custom: b.accesorio_tipo_custom || null,
          accesorio_material_id: b.accesorio_material_id || null,
          accesorio_material_custom: b.accesorio_material_custom || null,

          activo,
        },
      }
    );

    res.json({ message: "Producto actualizado" });
  } catch (error) {
    console.error("Error al actualizar producto:", error);
    res.status(500).json({ message: "Error al actualizar producto" });
  }
};

// ===========================
// Eliminar producto
// ===========================
export const deleteProduct = async (req: Request, res: Response) => {
  try {
    const u: any = (req as any).user;

    const [rows] = await sequelize.query(
      `
      SELECT id
      FROM productos
      WHERE id = :id
      AND vendedor_id = :vid
    `,
      { replacements: { id: req.params.id, vid: u.id } }
    );

    if (!rows.length) {
      res.status(404).json({ message: "Producto no encontrado" });
      return;
    }

    await sequelize.query(
      `DELETE FROM productos WHERE id = :id AND vendedor_id = :vid`,
      { replacements: { id: req.params.id, vid: u.id } }
    );

    res.json({ message: "Producto eliminado" });
  } catch (error) {
    console.error("Error al eliminar producto:", error);
    res.status(500).json({ message: "Error al eliminar producto" });
  }
};

// ===========================
// Activar / desactivar producto
// ===========================
export const toggleProductActive = async (req: Request, res: Response) => {
  try {
    const u: any = (req as any).user;
    const { activo } = req.body;

    const [rows] = await sequelize.query(
      `
      SELECT id
      FROM productos
      WHERE id = :id AND vendedor_id = :vid
    `,
      {
        replacements: { id: req.params.id, vid: u.id },
      }
    );

    if (!rows.length) {
      res.status(404).json({ message: "Producto no encontrado" });
      return;
    }

    await sequelize.query(
      `
      UPDATE productos
      SET activo = :activo, updated_at = now()
      WHERE id = :id AND vendedor_id = :vid
    `,
      { replacements: { id: req.params.id, vid: u.id, activo: Boolean(activo) } }
    );

    res.json({ message: "Estado actualizado", activo: Boolean(activo) });
  } catch (error) {
    console.error("Error al cambiar estado:", error);
    res.status(500).json({ message: "Error al cambiar estado" });
  }
};

// ===========================
// Productos por categoría (slug)
// ===========================
export const getProductsByCategory = async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;

    const [categoriaRows]: any = await sequelize.query(
      `
      SELECT id, nombre, imagen_url
      FROM categorias
      WHERE LOWER(nombre) = LOWER(:slug)
      LIMIT 1
    `,
      { replacements: { slug } }
    );

    if (!categoriaRows.length) {
      res.status(404).json({ message: "Categoría no encontrada" });
      return;
    }

    const categoria = categoriaRows[0];

    const [productos]: any = await sequelize.query(
      `
      SELECT id, nombre, precio, descripcion, imagen_url, created_at
      FROM productos
      WHERE categoria_id = :catId AND activo = true
      ORDER BY created_at DESC
    `,
      { replacements: { catId: categoria.id } }
    );

    res.json({ categoria, productos });
  } catch (error) {
    console.error("Error al obtener productos por categoría:", error);
    res.status(500).json({ message: "Error al obtener productos por categoría" });
  }
};

// ===========================
// Productos nuevos
// ===========================
export const getNewProducts = async (_req: Request, res: Response) => {
  try {
    const [rows] = await sequelize.query(`
      SELECT id, nombre, precio, imagen_url, created_at
      FROM productos
      WHERE created_at >= (NOW() AT TIME ZONE 'UTC') - INTERVAL '15 days'
      AND activo = true
      ORDER BY created_at DESC
      LIMIT 20
    `);

    res.json(rows ?? []);
  } catch (error) {
    console.error("Error al obtener nuevos productos:", error);
    res.status(500).json({ message: "Error al obtener nuevos productos" });
  }
};

// ===========================
// Filtros dinámicos / búsqueda avanzada
// ===========================
export const getFilteredProducts = async (req: Request, res: Response) => {
  try {
    const {
      search,
      categoria_id,
      precioMin = 0,
      precioMax = 999_999,
      sort,

      accesorio_id,
      accesorio_tipo_id,
      accesorio_material_id,

      clase_id,
      tela_id,

      departamento,
      municipio,

      page = 1,
      limit = 40,
    } = req.query as any;

    const whereParts = ["p.activo = true"];
    const replacements: any = {};

    // 🔍 Búsqueda por texto
    if (search && String(search).trim()) {
      replacements.search = `%${String(search).trim()}%`;
      whereParts.push(`
        (p.nombre ILIKE :search
        OR p.descripcion ILIKE :search
        OR c.nombre ILIKE :search
        OR p.categoria_custom ILIKE :search
        OR p.tela_custom ILIKE :search
        OR p.departamento ILIKE :search
        OR p.municipio ILIKE :search)
      `);
    }

    // Filtros directos
    if (categoria_id) {
      replacements.categoria_id = Number(categoria_id);
      whereParts.push("p.categoria_id = :categoria_id");
    }

    replacements.precioMin = Number(precioMin);
    replacements.precioMax = Number(precioMax);
    whereParts.push("p.precio BETWEEN :precioMin AND :precioMax");

    if (accesorio_id) {
      replacements.accesorio_id = Number(accesorio_id);
      whereParts.push("p.accesorio_id = :accesorio_id");
    }

    if (accesorio_tipo_id) {
      replacements.accesorio_tipo_id = Number(accesorio_tipo_id);
      whereParts.push("p.accesorio_tipo_id = :accesorio_tipo_id");
    }

    if (accesorio_material_id) {
      replacements.accesorio_material_id = Number(accesorio_material_id);
      whereParts.push("p.accesorio_material_id = :accesorio_material_id");
    }

    if (clase_id) {
      replacements.clase_id = Number(clase_id);
      whereParts.push("p.clase_id = :clase_id");
    }

    if (tela_id) {
      replacements.tela_id = Number(tela_id);
      whereParts.push("p.tela_id = :tela_id");
    }

    if (departamento) {
      replacements.departamento = String(departamento);
      whereParts.push("p.departamento = :departamento");
    }

    if (municipio) {
      replacements.municipio = String(municipio);
      whereParts.push("p.municipio = :municipio");
    }

    // WHERE
    const whereSql = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";

    // ORDER BY
    let orderSql = "ORDER BY p.created_at DESC";
    if (sort === "precio_asc") orderSql = "ORDER BY p.precio ASC";
    if (sort === "precio_desc") orderSql = "ORDER BY p.precio DESC";

    // Paginación
    const pageNum = Math.max(Number(page), 1);
    const limitNum = Math.min(Math.max(Number(limit), 1), 100);
    const offset = (pageNum - 1) * limitNum;

    // Query base
    const baseSelect = `
      FROM productos p
      LEFT JOIN categorias c ON c.id = p.categoria_id
      ${whereSql}
    `;

    // Data
    const [rows] = await sequelize.query(
      `
      SELECT
        p.id, p.nombre, p.descripcion, p.precio,
        p.imagen_url, p.departamento, p.municipio,
        c.nombre AS categoria, p.created_at
      ${baseSelect}
      ${orderSql}
      LIMIT :limitNum OFFSET :offset
    `,
      { replacements: { ...replacements, limitNum, offset } }
    );

    // Total
    const [countRows]: any = await sequelize.query(
      `SELECT COUNT(*)::int AS total ${baseSelect}`,
      { replacements }
    );

    const total = countRows?.[0]?.total ?? 0;

    // Si no hay resultados pero hay búsqueda → sugerencias
    let related: any[] = [];
    if (total === 0 && search) {
      const [relatedRows] = await sequelize.query(
        `
        SELECT
          p.id, p.nombre, p.descripcion, p.precio,
          p.imagen_url, c.nombre AS categoria
        FROM productos p
        LEFT JOIN categorias c ON c.id = p.categoria_id
        WHERE p.activo = true
        AND (p.nombre ILIKE :search OR p.descripcion ILIKE :search)
        ORDER BY p.created_at DESC
        LIMIT 24
      `,
        { replacements: { search: `%${String(search).trim()}%` } }
      );

      related = relatedRows || [];
    }

    res.json({
      success: true,
      total,
      data: rows,
      related,
      page: pageNum,
      limit: limitNum,
    });
  } catch (error) {
    console.error("Error en getFilteredProducts:", error);
    res.status(500).json({ error: "Error al obtener productos" });
  }
};

// ===========================
// Filtros únicos (categoría_custom, tela_custom)
// ===========================
export const getFilters = async (req: Request, res: Response) => {
  try {
    const tipo = req.params.tipo;

    if (!["categories", "fabrics"].includes(tipo)) {
      res.status(400).json({ message: "Tipo de filtro no válido" });
      return;
    }

    const columna =
      tipo === "categories" ? "categoria_custom" : "tela_custom";

    const [rows] = await sequelize.query(
      `SELECT DISTINCT ${columna} AS nombre
       FROM productos
       WHERE ${columna} IS NOT NULL
       ORDER BY nombre ASC`
    );

    res.json({
      data: rows.map((r: any) => r.nombre).filter(Boolean),
    });
  } catch (error) {
    console.error("Error al obtener filtros:", error);
    res.status(500).json({ message: "Error al obtener filtros" });
  }
};
