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
// Catálogos públicos
// ===========================
export const getCategorias = async (_req: Request, res: Response): Promise<void> => {
  try {
    const [rows]: any = await sequelize.query(`
      SELECT id, nombre, imagen_url
      FROM categorias
      ORDER BY nombre ASC
    `);

    res.json(rows);
  } catch (error: any) {
    console.error("Error al obtener categorías:", error);
    res.status(500).json({ message: "Error al obtener categorías" });
  }
};

export const getClases = async (_req: Request, res: Response): Promise<void> => {
  try {
    const [rows]: any = await sequelize.query(
      `SELECT id, nombre, alias FROM clases ORDER BY nombre ASC`
    );
    res.json(rows);
  } catch (error) {
    console.error("Error al obtener clases:", error);
    res.status(500).json({ message: "Error al obtener clases" });
  }
};

// Regiones (compatibilidad, aunque ya no sea el modelo final)
export const getRegiones = async (_req: Request, res: Response): Promise<void> => {
  try {
    const [rows]: any = await sequelize.query(
      `SELECT id, nombre FROM regiones ORDER BY nombre ASC`
    );
    res.json(rows);
  } catch (error) {
    console.error("Error al obtener regiones:", error);
    res.status(500).json({ message: "Error al obtener regiones" });
  }
};

export const getTelas = async (req: Request, res: Response): Promise<void> => {
  const claseId = Number(req.query.clase_id);
  if (!claseId) {
    res.status(400).json({ message: "clase_id requerido" });
    return;
  }

  try {
    const [rows]: any = await sequelize.query(
      `SELECT id, nombre FROM telas WHERE clase_id = :claseId ORDER BY nombre ASC`,
      { replacements: { claseId } },
    );
    res.json(rows);
  } catch (error) {
    console.error("Error al obtener telas:", error);
    res.status(500).json({ message: "Error al obtener telas" });
  }
};

// ===========================
// Taxonomía de accesorios
// ===========================
export const getAccesorios = async (req: Request, res: Response): Promise<void> => {
  try {
    const tipo = (req.query.tipo as string) || "normal";
    const [rows]: any = await sequelize.query(
      `SELECT id, nombre, categoria_tipo
       FROM accesorios
       WHERE categoria_tipo = :tipo
       ORDER BY nombre ASC`,
      { replacements: { tipo } },
    );
    res.json(rows);
  } catch (e) {
    console.error("Error en getAccesorios:", e);
    res
      .status(500)
      .json({ message: "Error al obtener accesorios", error: String(e) });
  }
};

export const getAccesorioTipos = async (req: Request, res: Response): Promise<void> => {
  const accesorioId = Number(req.query.accesorio_id);
  if (!accesorioId) {
    res.status(400).json({ message: "accesorio_id requerido" });
    return;
  }

  try {
    const [rows]: any = await sequelize.query(
      `SELECT id, nombre FROM accesorio_tipos WHERE accesorio_id = :accesorioId ORDER BY nombre ASC`,
      { replacements: { accesorioId } },
    );
    res.json(rows);
  } catch (error) {
    console.error("Error al obtener tipos de accesorio:", error);
    res.status(500).json({ message: "Error al obtener tipos de accesorio" });
  }
};

export const getAccesorioMateriales = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const accesorioId = Number(req.query.accesorio_id);
  if (!accesorioId) {
    res.status(400).json({ message: "accesorio_id requerido" });
    return;
  }

  try {
    const [rows]: any = await sequelize.query(
      `SELECT id, nombre FROM accesorio_materiales WHERE accesorio_id = :accesorioId ORDER BY nombre ASC`,
      { replacements: { accesorioId } },
    );
    res.json(rows);
  } catch (error) {
    console.error("Error al obtener materiales de accesorio:", error);
    res
      .status(500)
      .json({ message: "Error al obtener materiales de accesorio" });
  }
};

// ===========================
// CREAR PRODUCTO
// ===========================
export const createProduct = async (req: Request, res: Response): Promise<void> => {
  try {
    const u: any = (req as any).user;
    const b = req.body as any;

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

    // Subir imágenes a Supabase
    const files = (req.files as Express.Multer.File[]) || [];
    const urls: string[] = [];

    for (const f of files) {
      const filename = `products/${Date.now()}-${Math.round(
        Math.random() * 1e9,
      )}-${f.originalname}`;

      const { error } = await supabase.storage
        .from("productos")
        .upload(filename, f.buffer, { contentType: f.mimetype });
      if (error) throw error;

      const { data } = supabase.storage
        .from("productos")
        .getPublicUrl(filename);
      urls.push(data.publicUrl);
    }

    const primera = urls[0] ?? null;

    // Insert
    const [inserted]: any = await sequelize.query(
      `INSERT INTO productos (
        vendedor_id, nombre, descripcion, precio, stock,

        categoria_id,
        categoria_custom,

        clase_id,
        tela_id,
        tela_custom,

        departamento,
        municipio,
        departamento_custom,
        municipio_custom,

        accesorio_id,
        accesorio_custom,
        accesorio_tipo_id,
        accesorio_tipo_custom,
        accesorio_material_id,
        accesorio_material_custom,

        imagen_url, activo, created_at, updated_at
      ) VALUES (
        :vendedor_id, :nombre, :descripcion, :precio, :stock,

        :categoria_id,
        :categoria_custom,

        :clase_id,
        :tela_id,
        :tela_custom,

        :departamento,
        :municipio,
        :departamento_custom,
        :municipio_custom,

        :accesorio_id,
        :accesorio_custom,
        :accesorio_tipo_id,
        :accesorio_tipo_custom,
        :accesorio_material_id,
        :accesorio_material_custom,

        :imagen_url, :activo, now(), now()
      ) RETURNING id`,
      {
        replacements: {
          vendedor_id: u?.id ?? null,
          nombre: b.nombre,
          descripcion: b.descripcion || null,
          precio,
          stock,

          categoria_id: b.categoria_id ? Number(b.categoria_id) : null,
          categoria_custom: b.categoria_custom || null,

          clase_id: b.clase_id ? Number(b.clase_id) : null,
          tela_id: b.tela_id ? Number(b.tela_id) : null,
          tela_custom: b.tela_custom || null,

          departamento: b.departamento || null,
          municipio: b.municipio || null,
          departamento_custom: b.departamento_custom || null,
          municipio_custom: b.municipio_custom || null,

          accesorio_id: b.accesorio_id ? Number(b.accesorio_id) : null,
          accesorio_custom: b.accesorio_custom || null,
          accesorio_tipo_id: b.accesorio_tipo_id
            ? Number(b.accesorio_tipo_id)
            : null,
          accesorio_tipo_custom: b.accesorio_tipo_custom || null,
          accesorio_material_id: b.accesorio_material_id
            ? Number(b.accesorio_material_id)
            : null,
          accesorio_material_custom: b.accesorio_material_custom || null,

          imagen_url: primera,
          activo: b.activo === "true" || b.activo === true,
        },
      },
    );

    res.status(201).json({ id: inserted[0].id, imagenes: urls });
  } catch (e) {
    console.error("Error en createProduct:", e);
    res
      .status(500)
      .json({ message: "Error al crear producto", error: String(e) });
  }
};

// ===========================
// Productos del vendedor
// ===========================
export const getSellerProducts = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const u: any = (req as any).user;
    if (!u?.id) {
      res.status(401).json({ message: "No autenticado" });
      return;
    }

    const [rows]: any = await sequelize.query(
      `SELECT id, nombre, precio, stock, activo, imagen_url
       FROM productos
       WHERE vendedor_id = :vid
       ORDER BY created_at DESC`,
      { replacements: { vid: u.id } },
    );
    res.json(rows);
  } catch (e) {
    console.error("Error en getSellerProducts:", e);
    res
      .status(500)
      .json({ message: "Error al obtener productos", error: String(e) });
  }
};

// ===========================
// Obtener producto por ID (PÚBLICO)
// ===========================
export const getProductById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const [rows]: any = await sequelize.query(
      `
      SELECT 
        p.id,
        p.nombre,
        p.descripcion,
        p.precio,
        p.stock,
        p.imagen_url AS imagen_principal,
        p.departamento,
        p.municipio,
        c.nombre AS categoria,

        v.nombre_comercio AS vendedor_nombre,
        v.logo AS vendedor_logo_url,

        p.created_at
      FROM productos p
      LEFT JOIN categorias c ON c.id = p.categoria_id
      LEFT JOIN vendedor_perfil v ON v.user_id = p.vendedor_id
      WHERE p.id = :id AND p.activo = true
      LIMIT 1
      `,
      { replacements: { id } }
    );

    if (!rows || rows.length === 0) {
      res.status(404).json({ message: "Producto no encontrado" });
      return;
    }

    const product = rows[0];

    // Obtener imágenes adicionales
    const [imgs]: any = await sequelize.query(
      `
      SELECT id, url
      FROM producto_imagenes
      WHERE producto_id = :id
      ORDER BY id ASC
      `,
      { replacements: { id } }
    );

    product.imagenes = imgs || [];

    // Obtener productos relacionados
    const [related]: any = await sequelize.query(
      `
      SELECT 
        p.id,
        p.nombre,
        p.precio,
        p.imagen_url AS imagen_url
      FROM productos p
      WHERE p.categoria_id = (
        SELECT categoria_id FROM productos WHERE id = :id
      )
      AND p.id != :id
      AND p.activo = true
      ORDER BY p.created_at DESC
      LIMIT 12
      `,
      { replacements: { id } }
    );

    res.json({ product, related });

  } catch (e) {
    console.error("Error en getProductById:", e);
    res.status(500).json({
      message: "Error al obtener producto",
      error: String(e)
    });
  }
};


// ===========================
// Actualizar producto
// ===========================
export const updateProduct = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const u: any = (req as any).user;
    const { id } = req.params;
    const b = req.body as any;

    // 1) Verificar que el producto pertenece al vendedor
    const [rows]: any = await sequelize.query(
      `SELECT id FROM productos WHERE id = :id AND vendedor_id = :vid`,
      { replacements: { id, vid: u.id } },
    );

    if (!rows || rows.length === 0) {
      res.status(404).json({ message: "Producto no encontrado" });
      return;
    }

    // 2) Validaciones básicas (igual que en createProduct)
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

    // 3) Normalizar boolean activo
    const activo =
      b.activo === "true" || b.activo === true || b.activo === 1 || b.activo === "1";

    // 4) UPDATE con todos los campos "extendidos"
    await sequelize.query(
      `UPDATE productos
       SET
         nombre               = :nombre,
         descripcion          = :descripcion,
         precio               = :precio,
         stock                = :stock,

         -- categoría principal
         categoria_id         = :categoria_id,
         categoria_custom     = :categoria_custom,

         -- subcategorías de textiles
         clase_id             = :clase_id,
         tela_id              = :tela_id,
         tela_custom          = :tela_custom,

         -- origen (ubicación)
         departamento         = :departamento,
         municipio            = :municipio,
         departamento_custom  = :departamento_custom,
         municipio_custom     = :municipio_custom,

         -- subcategorías de accesorios
         accesorio_id             = :accesorio_id,
         accesorio_custom         = :accesorio_custom,
         accesorio_tipo_id        = :accesorio_tipo_id,
         accesorio_tipo_custom    = :accesorio_tipo_custom,
         accesorio_material_id    = :accesorio_material_id,
         accesorio_material_custom= :accesorio_material_custom,

         -- estado
         activo              = :activo,
         updated_at          = now()
       WHERE id = :id AND vendedor_id = :vid`,
      {
        replacements: {
          id,
          vid: u.id,

          nombre: b.nombre,
          descripcion: b.descripcion || null,
          precio,
          stock,

          // categoría principal
          categoria_id: b.categoria_id ? Number(b.categoria_id) : null,
          categoria_custom: b.categoria_custom || null,

          // subcategorías textiles
          clase_id: b.clase_id ? Number(b.clase_id) : null,
          tela_id: b.tela_id ? Number(b.tela_id) : null,
          tela_custom: b.tela_custom || null,

          // origen
          departamento: b.departamento || null,
          municipio: b.municipio || null,
          departamento_custom: b.departamento_custom || null,
          municipio_custom: b.municipio_custom || null,

          // accesorios
          accesorio_id: b.accesorio_id ? Number(b.accesorio_id) : null,
          accesorio_custom: b.accesorio_custom || null,
          accesorio_tipo_id: b.accesorio_tipo_id
            ? Number(b.accesorio_tipo_id)
            : null,
          accesorio_tipo_custom: b.accesorio_tipo_custom || null,
          accesorio_material_id: b.accesorio_material_id
            ? Number(b.accesorio_material_id)
            : null,
          accesorio_material_custom: b.accesorio_material_custom || null,

          // estado
          activo,
        },
      },
    );

    res.json({ message: "Producto actualizado correctamente" });
  } catch (e) {
    console.error("Error en updateProduct:", e);
    res
      .status(500)
      .json({ message: "Error al actualizar producto", error: String(e) });
  }
};

// ===========================
// Eliminar producto
// ===========================
export const deleteProduct = async (req: Request, res: Response): Promise<void> => {
  try {
    const u: any = (req as any).user;
    const { id } = req.params;

    const [rows]: any = await sequelize.query(
      `SELECT id FROM productos WHERE id = :id AND vendedor_id = :vid`,
      { replacements: { id, vid: u.id } },
    );
    if (!rows || rows.length === 0) {
      res.status(404).json({ message: "Producto no encontrado" });
      return;
    }

    await sequelize.query(
      `DELETE FROM productos WHERE id = :id AND vendedor_id = :vid`,
      {
        replacements: { id, vid: u.id },
      },
    );
    res.json({ message: "Producto eliminado" });
  } catch (e) {
    console.error("Error en deleteProduct:", e);
    res
      .status(500)
      .json({ message: "Error al eliminar producto", error: String(e) });
  }
};

// ===========================
// Activar / desactivar producto
// ===========================
export const toggleProductActive = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const u: any = (req as any).user;
    const { id } = req.params;
    const { activo } = req.body;

    const [rows]: any = await sequelize.query(
      `SELECT id FROM productos WHERE id = :id AND vendedor_id = :vid`,
      { replacements: { id, vid: u.id } },
    );
    if (!rows || rows.length === 0) {
      res.status(404).json({ message: "Producto no encontrado" });
      return;
    }

    await sequelize.query(
      `UPDATE productos SET activo = :activo, updated_at = now()
       WHERE id = :id AND vendedor_id = :vid`,
      { replacements: { id, vid: u.id, activo: Boolean(activo) } },
    );
    res.json({ message: "Estado actualizado", activo: Boolean(activo) });
  } catch (e) {
    console.error("Error en toggleProductActive:", e);
    res
      .status(500)
      .json({ message: "Error al cambiar estado", error: String(e) });
  }
};

// ===========================
// Productos por categoría (slug)
// ===========================
export const getProductsByCategory = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { slug } = req.params;

    const [categoriaRows]: any = await sequelize.query(
      `
        SELECT id, nombre, imagen_url
        FROM categorias
        WHERE LOWER(nombre) = LOWER(:slug)
        LIMIT 1
      `,
      { replacements: { slug } },
    );

    if (!categoriaRows || categoriaRows.length === 0) {
      res.status(404).json({ message: "Categoría no encontrada" });
      return;
    }

    const categoria = categoriaRows[0];

    const [productos]: any = await sequelize.query(
      `
        SELECT 
          id, nombre, precio, descripcion,
          imagen_url, created_at
        FROM productos
        WHERE categoria_id = :catId
          AND activo = true
        ORDER BY created_at DESC
      `,
      { replacements: { catId: categoria.id } },
    );

    res.json({ categoria, productos });
  } catch (error: any) {
    console.error("Error al obtener productos por categoría:", error);
    res.status(500).json({
      message: "Error al obtener productos por categoría",
    });
  }
};

// ===========================
// Productos nuevos
// ===========================
export const getNewProducts = async (_req: Request, res: Response): Promise<void> => {
  try {
    const [rows]: any = await sequelize.query(`
      SELECT 
        id, nombre, precio,
        imagen_url, created_at
      FROM productos
      WHERE created_at >= (NOW() AT TIME ZONE 'UTC') - INTERVAL '15 days'
      AND activo = true
      ORDER BY created_at DESC
      LIMIT 20
    `);

    res.json(rows ?? []);
  } catch (error: any) {
    console.error("Error al obtener nuevos productos:", error);
    res.status(500).json({ message: "Error al obtener nuevos productos" });
  }
};

// ===========================
// Filtros dinámicos / búsqueda avanzada
// ===========================
export const getFilteredProducts = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const {
      search,
      categoria_id,
      precioMin = 0,
      precioMax = 999999,
      sort,

      // accesorios
      accesorio_id,
      accesorio_tipo_id,
      accesorio_material_id,

      // telas / hilos
      clase_id,
      tela_id,

      // origen
      departamento,
      municipio,

      // paginación opcional
      page = 1,
      limit = 40,
    } = req.query as any;

    const whereParts: string[] = ["p.activo = true"];
    const replacements: any = {};

    // 🔎 Búsqueda por texto (nombre, desc, categoría, origen)
    if (search && String(search).trim() !== "") {
      replacements.search = `%${String(search).trim()}%`;
      whereParts.push(
        `(p.nombre ILIKE :search
          OR p.descripcion ILIKE :search
          OR c.nombre ILIKE :search
          OR p.categoria_custom ILIKE :search
          OR p.tela_custom ILIKE :search
          OR p.departamento ILIKE :search
          OR p.municipio ILIKE :search)`
      );
    }

    // categoría
    if (categoria_id) {
      replacements.categoria_id = Number(categoria_id);
      whereParts.push("p.categoria_id = :categoria_id");
    }

    // precio
    replacements.precioMin = Number(precioMin);
    replacements.precioMax = Number(precioMax);
    whereParts.push("p.precio BETWEEN :precioMin AND :precioMax");

    // accesorios
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

    // telas / clase
    if (clase_id) {
      replacements.clase_id = Number(clase_id);
      whereParts.push("p.clase_id = :clase_id");
    }
    if (tela_id) {
      replacements.tela_id = Number(tela_id);
      whereParts.push("p.tela_id = :tela_id");
    }

    // origen
    if (departamento) {
      replacements.departamento = String(departamento);
      whereParts.push("p.departamento = :departamento");
    }
    if (municipio) {
      replacements.municipio = String(municipio);
      whereParts.push("p.municipio = :municipio");
    }

    const whereSql = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";

    // orden
    let orderSql = "ORDER BY p.created_at DESC";
    if (sort === "precio_asc") orderSql = "ORDER BY p.precio ASC";
    if (sort === "precio_desc") orderSql = "ORDER BY p.precio DESC";

    const pageNum = Math.max(Number(page) || 1, 1);
    const limitNum = Math.min(Math.max(Number(limit) || 40, 1), 60);
    const offset = (pageNum - 1) * limitNum;

    // Query base (para SELECT y COUNT)
    const baseSelect = `
      FROM productos p
      LEFT JOIN categorias c ON c.id = p.categoria_id
      ${whereSql}
    `;

    // Datos
    const [rows]: any = await sequelize.query(
      `
      SELECT
        p.id,
        p.nombre,
        p.descripcion,
        p.precio,
        p.imagen_url,
        c.nombre AS categoria,
        p.departamento,
        p.municipio,
        p.created_at
      ${baseSelect}
      ${orderSql}
      LIMIT :limitNum OFFSET :offset
    `,
      {
        replacements: {
          ...replacements,
          limitNum,
          offset,
        },
      },
    );

    // Total
    const [countRows]: any = await sequelize.query(
      `
      SELECT COUNT(*)::int AS total
      ${baseSelect}
    `,
      { replacements },
    );

    const total = countRows?.[0]?.total ?? 0;

    // Si no hay resultados pero hay búsqueda → sugerencias relacionadas
    let related: any[] = [];
    if (total === 0 && search && String(search).trim() !== "") {
      const [relatedRows]: any = await sequelize.query(
        `
        SELECT
          p.id,
          p.nombre,
          p.descripcion,
          p.precio,
          p.imagen_url,
          c.nombre AS categoria,
          p.departamento,
          p.municipio,
          p.created_at
        FROM productos p
        LEFT JOIN categorias c ON c.id = p.categoria_id
        WHERE p.activo = true
          AND (p.nombre ILIKE :search OR p.descripcion ILIKE :search OR c.nombre ILIKE :search)
        ORDER BY p.created_at DESC
        LIMIT 24
      `,
        {
          replacements: {
            search: `%${String(search).trim()}%`,
          },
        },
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
export const getFilters = async (req: Request, res: Response): Promise<void> => {
  try {
    const tipo = req.params.tipo;
    if (!["categories", "fabrics"].includes(tipo)) {
      res.status(400).json({ message: "Tipo de filtro no válido" });
      return;
    }

    let columna = "categoria_custom";
    if (tipo === "fabrics") columna = "tela_custom";

    const [rows]: any = await sequelize.query(
      `SELECT DISTINCT ${columna} AS nombre FROM productos WHERE ${columna} IS NOT NULL ORDER BY nombre ASC`
    );

    res.json({ data: rows.map((r: any) => r.nombre).filter(Boolean) });
  } catch (e) {
    console.error("Error al obtener filtros:", e);
    res.status(500).json({ message: "Error al obtener filtros" });
  }
};
