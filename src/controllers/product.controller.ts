// src/controllers/product.controller.ts
import { Request, Response } from "express";
import { sequelize } from "../config/db";
import multer from "multer";
import supabase from "../lib/supabase";
import Product from "../models/product.model";
import { Op } from "sequelize";
import { validate as isUUID } from "uuid";
import { QueryTypes } from "sequelize";
import { buildPublicProductDTO } from "../utils/buildPublicProductDTO";
import { buildPublicProductCardDTO } from "../utils/buildPublicProductCardDTO"
import { buildSearchProductDTO } from "../utils/buildSearchProductDTO";
import { logEvent } from "../utils/eventLogger";
import { can } from "../services/authorization.service";


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
      console.error("🔥 ERROR TRENDING:");
      console.error(error);
      console.error(error?.message);
      console.error(error?.parent);
      res.status(500).json({ message: error?.message || "Error interno" });
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

    // ======================
    // 🔒 Validación categoría obligatoria
    // ======================
    if (
      (!b.categoria_id || b.categoria_id === "") &&
      (!b.categoria_custom || String(b.categoria_custom).trim() === "")
    ) {
      await t.rollback();
      res.status(400).json({
        message: "Debe seleccionar una categoría o ingresar una personalizada",
      });
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

    // 🔒 Validación UUID
    if (!id || !isUUID(id)) {
      res.status(400).json({
        message: "ID de producto inválido",
      });
      return;
    }

    // ===========================
    // 🔎 PRODUCTO DETALLE
    // ===========================
    const query = `
      SELECT 
        p.id,
        p.nombre,
        p.descripcion,
        p.precio,
        p.imagen_url AS imagen_principal,
        p.departamento,
        p.municipio,
        p.rating_avg,
        p.rating_count,

        -- Categoria estructurada
        c.id AS categoria_id,
        c.nombre AS categoria_nombre,

        -- Vendedor estructurado
        v.user_id AS vendedor_id,
        v.nombre_comercio,
        v.logo,

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

      WHERE p.id = :id 
      AND p.activo = true
      AND v.estado_validacion = 'aprobado'
      AND v.estado_admin = 'activo'
      GROUP BY 
        p.id,
        c.id,
        c.nombre,
        v.user_id,
        v.nombre_comercio,
        v.logo
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

    const rawProduct = rows[0];

    // ===========================
    // 📊 Registrar vista
    // ===========================
    try {
      await sequelize.query(
        `
        INSERT INTO product_views (product_id, ip_address, user_agent)
        VALUES (:product_id, :ip, :ua)
        `,
        {
          replacements: {
            product_id: rawProduct.id,
            ip: req.ip || null,
            ua: req.headers["user-agent"] || null,
          },
          type: QueryTypes.INSERT,
        }
      );
    } catch (viewError) {
      console.error("Error registrando vista:", viewError);
    }

    const product = buildPublicProductDTO(rawProduct);

    await logEvent({
      type: "product_view",
      user_id: (req as any).user?.id || null,
      product_id: id,
    });

    // 🔒 Limitar galería adicional a 4
    if (Array.isArray(product.imagenes)) {
      product.imagenes = product.imagenes.slice(0, 4);
    }

    // ===========================
    // 🔎 PRODUCTOS RELACIONADOS (CardDTO)
    // ===========================
    const relatedQuery = `
      SELECT 
        p.id,
        p.nombre,
        p.precio,
        p.imagen_url,
        p.departamento,
        p.municipio,
        c.id AS categoria_id,
        c.nombre AS categoria_nombre
      FROM productos p
      LEFT JOIN categorias c ON c.id = p.categoria_id
      JOIN vendedor_perfil v ON v.user_id = p.vendedor_id
      WHERE p.categoria_id = (
        SELECT categoria_id FROM productos WHERE id = :id
      )
      AND p.id != :id
      AND p.activo = true
      AND v.estado_validacion = 'aprobado'
      AND v.estado_admin = 'activo'
      ORDER BY p.created_at DESC
      LIMIT 12
    `;

    const relatedRows: any = await sequelize.query(relatedQuery, {
      replacements: { id },
      type: QueryTypes.SELECT,
    });

    const related = (relatedRows || []).map((r: any) =>
      buildPublicProductCardDTO(r)
    );

    // ===========================
    // 📦 RESPUESTA FINAL
    // ===========================
    res.json({
      product,
      related,
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

    // 🔒 Validación categoría obligatoria
    if (
      (!b.categoria_id || b.categoria_id === "") &&
      (!b.categoria_custom || String(b.categoria_custom).trim() === "")
    ) {
      res.status(400).json({
        message: "Debe seleccionar una categoría o ingresar una personalizada",
      });
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
    const productId = req.params.id;

    // 🔐 Validar autenticación
    if (!u?.id) {
      res.status(401).json({ message: "No autenticado" });
      return;
    }

    // 🔎 Validar parámetro
    if (!productId) {
      res.status(400).json({ message: "ID de producto requerido" });
      return;
    }

    const activar = Boolean(activo);

    // =====================================================
    // 🔐 Verificar estado administrativo del vendedor
    // =====================================================
    const vendedorEstado: any = await sequelize.query(
      `
      SELECT estado_validacion, estado_admin
      FROM vendedor_perfil
      WHERE user_id = :userId
      `,
      {
        replacements: { userId: u.id },
        type: QueryTypes.SELECT,
      }
    );

    if (!vendedorEstado.length) {
      res.status(403).json({ message: "Perfil de vendedor no encontrado" });
      return;
    }

    const perfil = vendedorEstado[0];

    // 🚨 Solo validar si intenta ACTIVAR
    if (activar === true) {

      // 🔴 Suspensión administrativa
      if (perfil.estado_admin === "suspendido") {
        res.status(403).json({
          message: "Tu comercio está suspendido y no puede activar productos.",
        });
        return;
      }

      // 🔒 No aprobado legalmente
      if (perfil.estado_validacion !== "aprobado") {
        res.status(403).json({
          message: "No puedes activar productos hasta que tu comercio sea aprobado.",
        });
        return;
      }
    }

    // =====================================================
    // 🔎 Verificar que el producto pertenece al vendedor
    // =====================================================
    const producto: any = await sequelize.query(
      `
      SELECT id
      FROM productos
      WHERE id = :id AND vendedor_id = :vid
      `,
      {
        replacements: { id: productId, vid: u.id },
        type: QueryTypes.SELECT,
      }
    );

    if (!producto.length) {
      res.status(404).json({ message: "Producto no encontrado" });
      return;
    }

    // =====================================================
    // 🔄 Actualizar estado
    // =====================================================
    await sequelize.query(
      `
      UPDATE productos
      SET activo = :activo,
          updated_at = now()
      WHERE id = :id AND vendedor_id = :vid
      `,
      {
        replacements: {
          id: productId,
          vid: u.id,
          activo: activar,
        },
      }
    );

    res.json({
      success: true,
      message: activar
        ? "Producto activado correctamente"
        : "Producto desactivado correctamente",
      activo: activar,
    });

  } catch (error) {
    console.error("❌ Error en toggleProductActive:", error);
    res.status(500).json({
      message: "Error al cambiar estado del producto",
    });
  }
};

// ===========================
// Productos por categoría (slug)
// ===========================
export const getProductsByCategory = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { slug } = req.params;

    if (!slug || typeof slug !== "string") {
      res.status(400).json({ message: "Slug inválido" });
      return;
    }

    // 1️⃣ Buscar categorías relacionadas (match flexible)
    const categorias: any = await sequelize.query(
      `
      SELECT id, nombre
      FROM categorias
      WHERE LOWER(nombre) LIKE :slug
      `,
      {
        replacements: {
          slug: `%${slug.toLowerCase()}%`,
        },
        type: QueryTypes.SELECT,
      }
    );

    if (!categorias.length) {
      res.status(404).json({ message: "Categoría no encontrada" });
      return;
    }

    const categoriaIds = categorias.map((c: any) => c.id);

    // 2️⃣ Traer productos SOLO de vendedores activos y aprobados
    const productos: any = await sequelize.query(
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
      JOIN vendedor_perfil v ON v.user_id = p.vendedor_id
      WHERE 
        p.activo = true
        AND v.estado_validacion = 'aprobado'
        AND v.estado_admin = 'activo'
        AND p.categoria_id IN (:categoriaIds)
      ORDER BY p.created_at DESC
      `,
      {
        replacements: { categoriaIds },
        type: QueryTypes.SELECT,
      }
    );

    res.json({
      success: true,
      categoria: categorias[0], // solo para título principal
      total: productos.length,
      productos,
    });

  } catch (error) {
    console.error("Error al obtener productos por categoría:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener productos",
    });
  }
};

// ===========================
// Productos nuevos
// ===========================
export const getNewProducts = async (
  _req: Request,
  res: Response
): Promise<void> => {
  try {
    const query = `
      SELECT 
        p.id,
        p.nombre,
        p.precio,
        p.imagen_url,
        p.departamento,
        p.municipio,
        c.id AS categoria_id,
        c.nombre AS categoria_nombre
      FROM productos p
      LEFT JOIN categorias c ON c.id = p.categoria_id
      JOIN vendedor_perfil v ON v.user_id = p.vendedor_id
      WHERE p.activo = true
      AND v.estado_validacion = 'aprobado'
      AND v.estado_admin = 'activo'
        AND p.imagen_url IS NOT NULL
      ORDER BY p.created_at DESC
      LIMIT 20
    `;

    const rows: any = await sequelize.query(query, {
      type: QueryTypes.SELECT,
    });

    const data = (rows || []).map((r: any) =>
      buildPublicProductCardDTO(r)
    );

    res.json(data);
  } catch (error) {
    console.error("Error al obtener nuevos productos:", error);
    res.status(500).json({ message: "Error al obtener nuevos productos" });
  }
};

// ===========================
// Filtros dinámicos / búsqueda avanzada
// ===========================
export const getFilteredProducts = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const {
      search,
      categoria_id,
      clase_id,
      tela_id,

      // accesorios
      accesorio_id,
      accesorio_tipo_id,
      accesorio_material_id,

      // origen
      departamento,
      municipio,

      // precio
      precioMin,
      precioMax,

      ratingMin,

      // orden
      sort,

      // paginación
      page = "1",
      limit = "40",
    } = req.query as any;

    // ============================
    // 📄 Paginación segura
    // ============================
    const pageNumber = Math.max(Number(page) || 1, 1);
    const limitNumber = Math.min(Math.max(Number(limit) || 40, 1), 60);
    const offset = (pageNumber - 1) * limitNumber;

    const whereConditions: string[] = [
      "p.activo = true",
      "v.estado_validacion = 'aprobado'",
      "v.estado_admin = 'activo'"
    ];

    const replacements: any = {
      limit: limitNumber,
      offset,
    };

    // ============================
    // 🔎 Search extendido
    // ============================
    if (search && String(search).trim() !== "") {
      whereConditions.push(`
        p.search_vector @@ plainto_tsquery('spanish', :search)
      `);
    
      replacements.search = String(search).trim();
    }        

    // ============================
    // 📂 Filtros estructurados
    // ============================
    if (categoria_id) {
      whereConditions.push("p.categoria_id = :categoria_id");
      replacements.categoria_id = Number(categoria_id);
    }

    if (clase_id) {
      whereConditions.push("p.clase_id = :clase_id");
      replacements.clase_id = Number(clase_id);
    }

    if (tela_id) {
      whereConditions.push("p.tela_id = :tela_id");
      replacements.tela_id = Number(tela_id);
    }

    // accesorios
    if (accesorio_id) {
      whereConditions.push("p.accesorio_id = :accesorio_id");
      replacements.accesorio_id = Number(accesorio_id);
    }

    if (accesorio_tipo_id) {
      whereConditions.push("p.accesorio_tipo_id = :accesorio_tipo_id");
      replacements.accesorio_tipo_id = Number(accesorio_tipo_id);
    }

    if (accesorio_material_id) {
      whereConditions.push("p.accesorio_material_id = :accesorio_material_id");
      replacements.accesorio_material_id = Number(accesorio_material_id);
    }

    // origen
    if (departamento) {
      whereConditions.push("p.departamento = :departamento");
      replacements.departamento = departamento;
    }

    if (municipio) {
      whereConditions.push("p.municipio = :municipio");
      replacements.municipio = municipio;
    }

    // precio
    if (precioMin !== undefined) {
      whereConditions.push("p.precio >= :precioMin");
      replacements.precioMin = Number(precioMin);
    }
    
    if (precioMax !== undefined) {
      whereConditions.push("p.precio <= :precioMax");
      replacements.precioMax = Number(precioMax);
    }    

    // ⭐ Filtro por rating mínimo
    if (ratingMin !== undefined) {
      const ratingMinNumber = Number(ratingMin);

      if (Number.isFinite(ratingMinNumber)) {
        whereConditions.push("COALESCE(p.rating_avg, 0) >= :ratingMin");
        replacements.ratingMin = ratingMinNumber;
      }
    }

    const whereSQL = whereConditions.length
      ? `WHERE ${whereConditions.join(" AND ")}`
      : "";

    // ============================
    // 🔃 Ordenamiento inteligente
    // ============================
    let orderSQL = "ORDER BY p.created_at DESC";

    // 🔎 Si hay búsqueda → ordenar por relevancia
    if (search && String(search).trim() !== "") {
      orderSQL = `
        ORDER BY 
        ts_rank(
          p.search_vector,
          plainto_tsquery('spanish', :search)
        ) DESC,
        p.created_at DESC
      `;
    }

    // 💰 Orden explícito por precio (sobrescribe todo)
    if (sort === "precio_asc") orderSQL = "ORDER BY p.precio ASC";
    if (sort === "precio_desc") orderSQL = "ORDER BY p.precio DESC";

    if (sort === "top_rated") {
      orderSQL = `
        ORDER BY 
          (p.rating_avg * LN(1 + p.rating_count)) DESC,
          p.rating_count DESC,
          p.created_at DESC
      `;
    }        

    const ratingMinNumber =
      ratingMin !== undefined && ratingMin !== null
        ? Number(ratingMin)
        : null;    

    // ============================
    // 📊 Query principal
    // ============================
    const query = `
      SELECT 
        p.id,
        p.nombre,
        p.precio,
        p.imagen_url,
        p.departamento,
        p.municipio,
        p.rating_avg,
        p.rating_count,
        c.id AS categoria_id,
        c.nombre AS categoria_nombre,
        ${
          search && String(search).trim() !== ""
            ? "ts_rank(p.search_vector, plainto_tsquery('spanish', :search)) AS rank"
            : "0 AS rank"
        }
      FROM productos p
      JOIN vendedor_perfil v ON v.user_id = p.vendedor_id
      LEFT JOIN categorias c ON c.id = p.categoria_id
      ${whereSQL}
      ${orderSQL}
      LIMIT :limit
      OFFSET :offset
    `;

    const rows: any = await sequelize.query(query, {
      replacements,
      type: QueryTypes.SELECT,
    });

    if (search && String(search).trim() !== "") {
      await logEvent({
        type: "search_query",
        user_id: (req as any).user?.id || null,
        metadata: { query: search },
      });
}

    // ============================
    // 📈 Total count
    // ============================
    const countQuery = `
      SELECT COUNT(*)::int AS total
      FROM productos p
      JOIN vendedor_perfil v ON v.user_id = p.vendedor_id
      ${whereSQL}
    `;

    const countResult: any = await sequelize.query(countQuery, {
      replacements,
      type: QueryTypes.SELECT,
    });

    const total = countResult[0]?.total || 0;

    if (total === 0 && search) {
      await logEvent({
        type: "search_query",
        user_id: (req as any).user?.id || null,
        metadata: {
          query: search,
          no_results: true,
        },
      });
    }

    // ============================
    // 🔁 Related si no hay resultados
    // ============================
    let related: any[] = [];

    if (total === 0 && search) {
      const relatedQuery = `
        SELECT 
          p.id,
          p.nombre,
          p.precio,
          p.imagen_url,
          p.departamento,
          p.municipio,
          c.id AS categoria_id,
          c.nombre AS categoria_nombre
        FROM productos p
        JOIN vendedor_perfil v ON v.user_id = p.vendedor_id
        LEFT JOIN categorias c ON c.id = p.categoria_id
        WHERE p.activo = true
        AND v.estado_validacion = 'aprobado'
        AND v.estado_admin = 'activo'
        AND (
          p.nombre ILIKE :search
          OR p.descripcion ILIKE :search
          OR c.nombre ILIKE :search
        )
        ORDER BY p.created_at DESC
        LIMIT 24
      `;

      related = await sequelize.query(relatedQuery, {
        replacements: { search: `%${String(search).trim()}%` },
        type: QueryTypes.SELECT,
      });
    }

    const data = rows.map((r: any) =>
      buildSearchProductDTO(r)
    );

    const relatedCards = related.map((r: any) =>
      buildPublicProductCardDTO(r)
    );

    res.json({
      success: true,
      total,
      page: pageNumber,
      limit: limitNumber,
      data,
      related: relatedCards,
    });

  } catch (error) {
    console.error("Error en getFilteredProducts:", error);
    res.status(500).json({
      message: "Error al obtener productos",
    });
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

export const getProductReviews = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    if (!id) {
      res.status(400).json({ message: "ID de producto requerido" });
      return;
    }

    const rows: any = await sequelize.query(
      `
      SELECT 
        r.id,
        r.rating,
        r.comentario,
        r.created_at,
        u.nombre AS buyer_nombre
      FROM reviews r
      JOIN users u ON u.id = r.buyer_id
      JOIN productos p ON p.id = r.producto_id
      JOIN vendedor_perfil v ON v.user_id = p.vendedor_id
      WHERE 
        r.producto_id = :id
        AND p.activo = true
        AND v.estado_validacion = 'aprobado'
        AND v.estado_admin = 'activo'
      ORDER BY r.created_at DESC
      `,
      {
        replacements: { id },
        type: QueryTypes.SELECT,
      }
    );

    res.json({
      success: true,
      total: rows.length,
      reviews: rows,
    });

  } catch (error) {
    console.error("Error getProductReviews:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener reseñas",
    });
  }
};

export const createProductReview = async (
  req: Request,
  res: Response
): Promise<void> => {
  const t = await sequelize.transaction();

  try {
    const user: any = (req as any).user;
    const { id } = req.params;
    const { rating, comentario } = req.body;

    // ===============================
    // 🔐 Validar autenticación
    // ===============================
    if (!user?.id) {
      await t.rollback();
      res.status(401).json({ message: "No autenticado" });
      return;
    }

    // ===============================
    // 🔐 Validar rol comprador
    // ===============================
    if (user.rol !== "comprador" && user.rol !== "buyer") {
      await t.rollback();
      res.status(403).json({
        message: "Solo compradores pueden dejar reseñas",
      });
      return;
    }

    // ===============================
    // ⭐ Validar rating
    // ===============================
    const ratingNumber = Number(rating);

    if (
      !Number.isInteger(ratingNumber) ||
      ratingNumber < 1 ||
      ratingNumber > 5
    ) {
      await t.rollback();
      res.status(400).json({
        message: "Rating debe ser un número entero entre 1 y 5",
      });
      return;
    }

    // ===============================
    // 🔎 Verificar producto + vendedor
    // ===============================
    const producto: any = await sequelize.query(
      `
      SELECT p.id
      FROM productos p
      JOIN vendedor_perfil v ON v.user_id = p.vendedor_id
      WHERE 
        p.id = :id
        AND p.activo = true
        AND v.estado_validacion = 'aprobado'
        AND v.estado_admin = 'activo'
      `,
      {
        replacements: { id },
        type: QueryTypes.SELECT,
        transaction: t,
      }
    );

    if (!producto.length) {
      await t.rollback();
      res.status(404).json({
        message: "Producto no disponible para reseñas",
      });
      return;
    }

    // ===============================
    // 🔒 Evitar reseña duplicada
    // ===============================
    const existing: any = await sequelize.query(
      `
      SELECT id
      FROM reviews
      WHERE producto_id = :id AND buyer_id = :buyer_id
      `,
      {
        replacements: { id, buyer_id: user.id },
        type: QueryTypes.SELECT,
        transaction: t,
      }
    );

    if (existing.length > 0) {
      await t.rollback();
      res.status(400).json({
        message: "Ya has dejado una reseña para este producto",
      });
      return;
    }

    // ===============================
    // ✅ Insertar review
    // ===============================
    await sequelize.query(
      `
      INSERT INTO reviews (producto_id, buyer_id, rating, comentario)
      VALUES (:producto_id, :buyer_id, :rating, :comentario)
      `,
      {
        replacements: {
          producto_id: id,
          buyer_id: user.id,
          rating: ratingNumber,
          comentario: comentario || null,
        },
        transaction: t,
      }
    );

    // ===============================
    // 📊 Recalcular rating del producto
    // ===============================
    const ratingStats: any = await sequelize.query(
      `
      SELECT 
        COUNT(*)::int AS total,
        ROUND(AVG(rating)::numeric, 2) AS promedio
      FROM reviews
      WHERE producto_id = :id
      `,
      {
        replacements: { id },
        type: QueryTypes.SELECT,
        transaction: t,
      }
    );

    const totalReviews = ratingStats[0].total;
    const promedio = ratingStats[0].promedio || 0;

    // ===============================
    // 🔄 Actualizar producto
    // ===============================
    await sequelize.query(
      `
      UPDATE productos
      SET 
        rating_avg = :rating_avg,
        rating_count = :rating_count,
        updated_at = now()
      WHERE id = :id
      `,
      {
        replacements: {
          id,
          rating_avg: promedio,
          rating_count: totalReviews,
        },
        transaction: t,
      }
    );

    await t.commit();

    // ===============================
    // 📊 Log evento
    // ===============================
    await logEvent({
      type: "review_created",
      user_id: user.id,
      product_id: id,
    });

    res.status(201).json({
      success: true,
      message: "Reseña creada correctamente",
      rating_avg: promedio,
      rating_count: totalReviews,
    });

  } catch (error) {
    await t.rollback();
    console.error("❌ Error createProductReview:", error);
    res.status(500).json({
      success: false,
      message: "Error al crear reseña",
    });
  }
};

export const getTopProductsByCategory = async (
  req: Request,
  res: Response
) => {
  try {
    const categoriaId = Number(req.params.categoriaId);

    if (!categoriaId) {
      return res.status(400).json({ message: "Categoría inválida" });
    }

    const products = await sequelize.query(
      `
      SELECT
        p.id,
        p.nombre,
        p.precio,
        p.imagen_url,
        COUNT(r.id) AS total_reviews,
        COALESCE(ROUND(AVG(r.rating)::numeric, 2), 0) AS rating_avg,
        (
          (COUNT(r.id)::float / (COUNT(r.id) + 5)) * COALESCE(AVG(r.rating), 0)
          +
          (5.0 / (COUNT(r.id) + 5)) * 3.5
        ) AS weighted_score
      FROM productos p
      JOIN vendedor_perfil v ON v.user_id = p.vendedor_id
      LEFT JOIN reviews r ON r.producto_id = p.id
      WHERE p.activo = true
      AND v.estado_validacion = 'aprobado'
      AND v.estado_admin = 'activo'
      GROUP BY p.id
      ORDER BY weighted_score DESC NULLS LAST
      LIMIT 8
      `,
      { type: QueryTypes.SELECT }
    );    

    const normalized = (products as any[]).map((p) => ({
      id: p.id,
      nombre: p.nombre,
      precio: Number(p.precio),
      imagen_url: p.imagen_url,
      total_reviews: Number(p.total_reviews),
      rating_avg: Number(Number(p.rating_avg).toFixed(2)),
      weighted_score: Number(Number(p.weighted_score).toFixed(3)),
    }));

    res.json({
      success: true,
      data: normalized,
    });
  } catch (error) {
    console.error("Error obteniendo top productos por categoría:", error);
    res.status(500).json({ message: "Error interno" });
  }
};

export const getTrendingProducts = async (req: Request, res: Response) => {
  try {
    const products = await sequelize.query(
      `
      SELECT *
      FROM (
        SELECT
          p.id,
          p.nombre,
          p.precio,
          p.created_at,
          COALESCE(
          (
            SELECT pi.url
            FROM producto_imagenes pi
            WHERE pi.producto_id = p.id
            ORDER BY pi.created_at ASC
            LIMIT 1
          ),
          p.imagen_url
        ) AS imagen_url,
          COUNT(r.id) AS total_reviews,
          COALESCE(ROUND(AVG(r.rating)::numeric, 2), 0) AS rating_avg,
          (
            (
              (
                (COUNT(r.id)::float / (COUNT(r.id) + 5)) * COALESCE(AVG(r.rating), 0)
                +
                (5.0 / (COUNT(r.id) + 5)) * 3.5
              ) * 0.7
              +
              (
                GREATEST(0, 1 - EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 864000)
              ) * 0.3
            )
            *
            (
              CASE 
                WHEN EXISTS (
                  SELECT 1 
                  FROM producto_imagenes pi2
                  WHERE pi2.producto_id = p.id
                )
                THEN 1
                ELSE 0.85
              END
            )
          ) AS trending_score
        FROM productos p
        JOIN vendedor_perfil v ON v.user_id = p.vendedor_id
        LEFT JOIN reviews r ON r.producto_id = p.id
        WHERE p.activo = true
        AND v.estado_validacion = 'aprobado'
        AND v.estado_admin = 'activo'
        GROUP BY p.id
      ) sub
      ORDER BY
        sub.trending_score DESC,
        sub.total_reviews DESC,
        sub.created_at DESC
      LIMIT 8
      `,
      { type: QueryTypes.SELECT }
    );

    const normalized = (products as any[]).map((p: any) => ({
      id: p.id,
      nombre: p.nombre,
      precio: Number(p.precio),
      imagen_url: p.imagen_url,
      total_reviews: Number(p.total_reviews),
      rating_avg: Number(p.rating_avg),
      trending_score: Number(p.trending_score),
    }));

    res.json({
      success: true,
      data: normalized,
    });

  } catch (error) {
    console.error("Error obteniendo trending products:", error);
    res.status(500).json({ message: "Error interno" });
  }
};
