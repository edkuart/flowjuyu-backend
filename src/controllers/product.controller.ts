// src/controllers/product.controller.ts
import { Request, Response } from "express";
import { sequelize } from "../config/db";
import multer from "multer";
import supabase from "../lib/supabase";
import Product from "../models/product.model";
import { Op } from "sequelize";
import { validate as isUUID } from "uuid";
import { QueryTypes } from "sequelize";

// ===========================
// Helpers
// ===========================
const toIntOrNull = (v: any) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

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
  limits: { files: 5, fileSize: 5 * 1024 * 1024 },
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

export const getProductForEdit = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params
    const u: any = (req as any).user

    const query = `
      SELECT
        p.id,
        p.nombre,
        p.descripcion,
        p.precio,
        p.stock,
        p.activo,
        p.categoria_id,
        p.categoria_custom,
        p.clase_id,
        p.tela_id,
        p.tela_custom,
        p.departamento,
        p.municipio,
        p.departamento_custom,
        p.municipio_custom,
        p.accesorio_id,
        p.accesorio_custom,
        p.accesorio_tipo_id,
        p.accesorio_tipo_custom,
        p.accesorio_material_id,
        p.accesorio_material_custom,
        p.imagen_url AS imagen_principal,
        p.created_at,

        COALESCE(
          json_agg(
            DISTINCT jsonb_build_object(
              'id', pi.id,
              'url', pi.url
            )
          ) FILTER (WHERE pi.id IS NOT NULL),
          '[]'
        ) AS imagenes

      FROM productos p
      LEFT JOIN producto_imagenes pi ON pi.producto_id = p.id
      WHERE p.id = :id AND p.vendedor_id = :vid
      GROUP BY p.id
      LIMIT 1
    `

    const rows: any = await sequelize.query(query, {
      replacements: { id, vid: u.id },
      type: QueryTypes.SELECT,
    })

    if (!rows || rows.length === 0) {
      res.status(404).json({ message: "Producto no encontrado" })
      return
    }

    res.json({ product: rows[0] })
    return
  } catch (error) {
    console.error("Error getProductForEdit:", error)
    res.status(500).json({ message: "Error interno" })
    return
  }
}

export const deleteProductImage = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const u: any = (req as any).user
    const { id, imageId } = req.params

    // 1️⃣ Verificar imagen + producto + vendedor
    const [rows]: any = await sequelize.query(
      `
      SELECT pi.id, pi.url
      FROM producto_imagenes pi
      JOIN productos p ON p.id = pi.producto_id
      WHERE pi.id = :imageId
        AND p.id = :productId
        AND p.vendedor_id = :vid
      `,
      {
        replacements: {
          imageId,
          productId: id,
          vid: u.id,
        },
      }
    )

    if (!rows.length) {
      res.status(404).json({ message: "Imagen no encontrada" })
      return
    }

    const image = rows[0]

    // 2️⃣ Eliminar de Supabase
    const filePath = image.url.split("/productos/")[1]
    if (filePath) {
      await supabase.storage
        .from("productos")
        .remove([`products/${filePath}`])
    }

    // 3️⃣ Eliminar de BD
    await sequelize.query(
      `DELETE FROM producto_imagenes WHERE id = :imageId`,
      { replacements: { imageId } }
    )

    res.json({ message: "Imagen eliminada" })
    return
  } catch (error) {
    console.error("Error deleteProductImage:", error)
    res.status(500).json({ message: "Error al eliminar imagen" })
    return
  }
}

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
      { replacements: { tipo } }
    );

    res.json(rows);
  } catch (error) {
    console.error("Error en getAccesorios:", error);
    res.status(500).json({ message: "Error al obtener accesorios" });
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
  const t = await sequelize.transaction();
  const uploadedFiles: string[] = [];

  try {
    const u: any = (req as any).user;
    const b = req.body;

    // =====================
    // 1️⃣ Validaciones base
    // =====================
    if (!u?.id) {
      await t.rollback();
      res.status(401).json({ message: "No autenticado" });
      return;
    }

    if (!b.nombre || b.precio === undefined || b.stock === undefined) {
      await t.rollback();
      res.status(400).json({ message: "Campos obligatorios faltantes" });
      return;
    }

    if (!b.clase_id) {
      await t.rollback();
      res.status(400).json({ message: "clase_id es obligatorio" });
      return;
    }

    const precio = Number(b.precio);
    const stock = Number(b.stock);

    if (!Number.isFinite(precio) || precio <= 0) {
      await t.rollback();
      res.status(400).json({ message: "Precio inválido" });
      return;
    }

    if (!Number.isInteger(stock) || stock < 0) {
      await t.rollback();
      res.status(400).json({ message: "Stock inválido" });
      return;
    }

    // =====================
    // 2️⃣ Subir imágenes (temporal)
    // =====================
    const files = (req.files as Express.Multer.File[]) || [];
    const urls: string[] = [];

    for (const f of files) {
      const filename = `products/${Date.now()}-${Math.round(
        Math.random() * 1e9
      )}-${f.originalname}`;

      const { error } = await supabase.storage
        .from("productos")
        .upload(filename, f.buffer, { contentType: f.mimetype });

      if (error) throw error;

      uploadedFiles.push(filename);

      const { data } = supabase.storage
        .from("productos")
        .getPublicUrl(filename);

      urls.push(data.publicUrl);
    }

    const imagenPrincipal = urls[0] ?? null;

    // Galería (máx 5 imágenes incluyendo la principal)
    const galeria = urls.slice(1, 5);

    // =====================
    // 3️⃣ Insertar producto (ATÓMICO)
    // =====================
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
      ) RETURNING id
      `,
      {
        transaction: t,
        replacements: {
          vendedor_id: u.id,
      
          nombre: b.nombre,
          descripcion: b.descripcion || null,
          precio,
          stock,
      
          // ======================
          // Categoría
          // ======================
          categoria_id:
            b.categoria_id !== undefined && b.categoria_id !== null && b.categoria_id !== ""
              ? Number(b.categoria_id)
              : null,
          categoria_custom: b.categoria_custom || null,
      
          // ======================
          // Textiles
          // ======================
          clase_id:
            b.clase_id !== undefined && b.clase_id !== null && b.clase_id !== ""
              ? Number(b.clase_id)
              : null,
      
          tela_id:
            b.tela_id !== undefined && b.tela_id !== null && b.tela_id !== ""
              ? Number(b.tela_id)
              : null,
      
          tela_custom: b.tela_custom || null,
      
          // ======================
          // Origen
          // ======================
          departamento: b.departamento || null,
          municipio: b.municipio || null,
          departamento_custom: b.departamento_custom || null,
          municipio_custom: b.municipio_custom || null,
      
          // ======================
          // Accesorios
          // ======================
          accesorio_id:
            b.accesorio_id !== undefined && b.accesorio_id !== null && b.accesorio_id !== ""
              ? Number(b.accesorio_id)
              : null,
      
          accesorio_custom: b.accesorio_custom || null,
      
          accesorio_tipo_id:
            b.accesorio_tipo_id !== undefined &&
            b.accesorio_tipo_id !== null &&
            b.accesorio_tipo_id !== ""
              ? Number(b.accesorio_tipo_id)
              : null,
      
          accesorio_tipo_custom: b.accesorio_tipo_custom || null,
      
          accesorio_material_id:
            b.accesorio_material_id !== undefined &&
            b.accesorio_material_id !== null &&
            b.accesorio_material_id !== ""
              ? Number(b.accesorio_material_id)
              : null,
      
          accesorio_material_custom: b.accesorio_material_custom || null,
      
          // ======================
          // Imagen principal
          // ======================
          imagen_url: imagenPrincipal,
      
          // 🔒 decisión explícita de negocio
          activo: false,
        },
      }
      
    );

        // =====================
    // 4️⃣ Insertar galería de imágenes (si hay)
    // =====================
    if (galeria.length > 0) {
      for (const url of galeria) {
        await sequelize.query(
          `INSERT INTO producto_imagenes (producto_id, url, created_at)
           VALUES (:producto_id, :url, now())`,
          {
            transaction: t,
            replacements: {
              producto_id: inserted[0].id,
              url,
            },
          }
        );
      }
    }

    await t.commit();

    res.status(201).json({
      id: inserted[0].id,
      imagenes: urls,
      activo: false,
    });
  } catch (error) {
    console.error("❌ Error en createProduct (atomic):", error);

    await t.rollback();

    // =====================
    // 🧹 Limpieza de imágenes huérfanas
    // =====================
    if (uploadedFiles.length > 0) {
      await supabase.storage
        .from("productos")
        .remove(uploadedFiles);
    }

    res.status(500).json({ message: "Error al crear producto" });
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

      const [rows]: any = await sequelize.query(
        `SELECT id, nombre, precio, stock, activo, imagen_url
        FROM productos
        WHERE vendedor_id = :vid
        ORDER BY activo ASC, created_at DESC`,
        { replacements: { vid: u.id } }
      );    

    res.json(rows);
  } catch (error) {
    console.error("Error al obtener productos:", error);
    res.status(500).json({ message: "Error al obtener productos" });
  }
};

// ===========================
// Obtener producto por ID (PÚBLICO)
// ===========================
export const getProductById = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    // 🔥 VALIDACIÓN CRÍTICA
    if (!id || !isUUID(id)) {
      res.status(400).json({
        message: "ID de producto inválido"
      });
      return;
    }

    const query = `
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

        p.created_at,

        COALESCE(
          json_agg(
            DISTINCT jsonb_build_object(
              'id', pi.id,
              'url', pi.url
            )
          ) FILTER (WHERE pi.id IS NOT NULL),
          '[]'
        ) AS imagenes

      FROM productos p
      LEFT JOIN categorias c ON c.id = p.categoria_id
      LEFT JOIN vendedor_perfil v ON v.user_id = p.vendedor_id
      LEFT JOIN producto_imagenes pi ON pi.producto_id = p.id

      WHERE p.id = :id AND p.activo = true
      GROUP BY p.id, c.nombre, v.nombre_comercio, v.logo
      LIMIT 1
    `;

    const rows: any = await sequelize.query(query, {
      replacements: { id },
      type: QueryTypes.SELECT,
    });    

    if (!rows || rows.length === 0) {
      res.status(404).json({ message: "Producto no encontrado" });
      return;
    }

    const product = rows[0];
    console.log("PRODUCT DATA:", product);

    // 🔒 Seguridad extra: limitar a 4 adicionales (principal + 4 = 5 máx)
    if (Array.isArray(product.imagenes)) {
      product.imagenes = product.imagenes.slice(0, 4);
    }

    // ===========================
    // Productos relacionados
    // ===========================
    const relatedQuery = `
      SELECT 
        p.id,
        p.nombre,
        p.precio,
        p.imagen_url
      FROM productos p
      WHERE p.categoria_id = (
        SELECT categoria_id FROM productos WHERE id = :id
      )
      AND p.id != :id
      AND p.activo = true
      ORDER BY p.created_at DESC
      LIMIT 12
    `;

    const related: any = await sequelize.query(relatedQuery, {
      replacements: { id },
      type: QueryTypes.SELECT,
    });    

    res.json({
      product,
      related: related || [],
    });

  } catch (e) {
    console.error("Error en getProductById:", e);
    res.status(500).json({
      message: "Error al obtener producto",
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
    const b: any = req.body;
    const id = req.params.id;

    // 🔎 Logs útiles
    console.log("[updateProduct] content-type:", req.headers["content-type"]);
    console.log("[updateProduct] body keys:", Object.keys(b || {}));
    console.log(
      "[updateProduct] files:",
      Array.isArray(req.files)
        ? (req.files as any[]).map((f) => ({
            fieldname: f.fieldname,
            originalname: f.originalname,
            mimetype: f.mimetype,
            size: f.size,
          }))
        : req.files
    );

    // 1️⃣ Verificar pertenencia
    const [rows]: any = await sequelize.query(
      `SELECT id FROM productos WHERE id = :id AND vendedor_id = :vid`,
      { replacements: { id, vid: u.id } }
    );

    if (!rows || rows.length === 0) {
      res.status(404).json({ message: "Producto no encontrado" });
      return;
    }

    // 2️⃣ Validaciones seguras
    if (b.nombre == null || b.nombre === "") {
      res.status(400).json({ message: "nombre es obligatorio" });
      return;
    }

    if (b.precio == null || b.precio === "") {
      res.status(400).json({ message: "precio es obligatorio" });
      return;
    }

    if (b.stock == null || b.stock === "") {
      res.status(400).json({ message: "stock es obligatorio" });
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

    const activo =
      b.activo === "true" ||
      b.activo === true ||
      b.activo === 1 ||
      b.activo === "1";

    // 3️⃣ Subir imágenes nuevas
    const files = (Array.isArray(req.files) ? req.files : []) as Express.Multer.File[];
    const uploadedImageUrls: string[] = [];

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

      uploadedImageUrls.push(data.publicUrl);
    }

    // 4️⃣ UPDATE principal del producto
    await sequelize.query(
      `UPDATE productos
       SET
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
       WHERE id = :id AND vendedor_id = :vid`,
      {
        replacements: {
          id,
          vid: u.id,

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

          accesorio_tipo_id: b.accesorio_tipo_id ? Number(b.accesorio_tipo_id) : null,
          accesorio_tipo_custom: b.accesorio_tipo_custom || null,

          accesorio_material_id: b.accesorio_material_id ? Number(b.accesorio_material_id) : null,
          accesorio_material_custom: b.accesorio_material_custom || null,

          activo,
        },
      }
    );

    // 5️⃣ Guardar imágenes adicionales
    if (uploadedImageUrls.length > 0) {
      for (const url of uploadedImageUrls) {
        await sequelize.query(
          `
          INSERT INTO producto_imagenes (producto_id, url, created_at)
          VALUES (:producto_id, :url, now())
          `,
          {
            replacements: {
              producto_id: id,
              url,
            },
          }
        );
      }

      // 6️⃣ ACTUALIZAR imagen principal con la primera nueva
      await sequelize.query(
        `
        UPDATE productos
        SET imagen_url = :imagen_url,
            updated_at = now()
        WHERE id = :id AND vendedor_id = :vid
        `,
        {
          replacements: {
            id,
            vid: u.id,
            imagen_url: uploadedImageUrls[0],
          },
        }
      );
    }

    res.json({
      message: "Producto actualizado correctamente",
      imagenesAgregadas: uploadedImageUrls.length,
      imagenPrincipalActualizada: uploadedImageUrls.length > 0,
    });

  } catch (e) {
    console.error("Error en updateProduct:", e);
    res.status(500).json({
      message: "Error al actualizar producto",
      error: String(e),
    });
  }
};

// ===========================
// Cambiar imagen principal (VENDEDOR)
// ===========================
export const setPrincipalImage = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const u: any = (req as any).user;
    const { id } = req.params;
    const { imagen_url } = req.body;

    if (!imagen_url) {
      res.status(400).json({ message: "imagen_url requerida" });
      return;
    }

    // 1️⃣ Verificar que el producto pertenece al vendedor
    const [rows]: any = await sequelize.query(
      `
      SELECT id
      FROM productos
      WHERE id = :id AND vendedor_id = :vid
      `,
      {
        replacements: { id, vid: u.id },
      }
    );

    if (!rows.length) {
      res.status(404).json({ message: "Producto no encontrado" });
      return;
    }

    // 2️⃣ Actualizar imagen principal
    await sequelize.query(
      `
      UPDATE productos
      SET imagen_url = :imagen_url,
          updated_at = now()
      WHERE id = :id AND vendedor_id = :vid
      `,
      {
        replacements: {
          id,
          vid: u.id,
          imagen_url,
        },
      }
    );

    res.json({
      message: "Imagen principal actualizada correctamente",
    });

  } catch (error) {
    console.error("Error en setPrincipalImage:", error);
    res.status(500).json({
      message: "Error al actualizar imagen principal",
    });
  }
};

// ===========================
// Eliminar producto
// ===========================
export const deleteProduct = async (req: Request, res: Response): Promise<void> => {
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
export const toggleProductActive = async (
  req: Request,
  res: Response,
): Promise<void> => {
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
export const getProductsByCategory = async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;

    // 1️⃣ Buscar categorías relacionadas (NO exact match)
    const [categorias]: any = await sequelize.query(
      `
      SELECT id, nombre
      FROM categorias
      WHERE LOWER(nombre) LIKE :slug
      `,
      {
        replacements: {
          slug: `%${slug.toLowerCase()}%`,
        },
      }
    );

    if (!categorias.length) {
      res.status(404).json({ message: "Categoría no encontrada" });
      return;
    }

    const categoriaIds = categorias.map((c: any) => c.id);

    // 2️⃣ Traer productos de TODAS esas categorías
    const [productos]: any = await sequelize.query(
      `
      SELECT
        p.id,
        p.nombre,
        p.precio,
        p.descripcion,
        p.imagen_url,
        p.created_at,
        c.nombre AS categoria
      FROM productos p
      JOIN categorias c ON c.id = p.categoria_id
      WHERE p.activo = true
        AND p.categoria_id IN (:categoriaIds)
      ORDER BY p.created_at DESC
      `,
      {
        replacements: { categoriaIds },
      }
    );

    res.json({
      categoria: categorias[0], // solo para título
      productos,
    });
  } catch (error) {
    console.error("Error al obtener productos por categoría:", error);
    res.status(500).json({ message: "Error al obtener productos" });
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

    rows.forEach((p: any) => {
      if (!p.imagen_url || p.imagen_url.includes("/uploads/")) {
        p.imagen_url = null;
      }
    });

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
