import { RequestHandler } from "express"
import { sequelize } from "../config/db"
import multer from "multer"
import supabase from "../lib/supabase"

// ===========================
// Configuración de Multer (en memoria)
// ===========================
const storage = multer.memoryStorage()
const fileFilter: multer.Options["fileFilter"] = (_req, file, cb) =>
  /^image\/(png|jpe?g|webp|gif|avif)$/.test(file.mimetype)
    ? cb(null, true)
    : cb(new Error("Solo imágenes permitidas"))

export const uploadProductImages = multer({
  storage,
  limits: { files: 9, fileSize: 5 * 1024 * 1024 },
  fileFilter,
})

// ===========================
// GETs auxiliares
// ===========================
export const getCategorias: RequestHandler = async (_req, res) => {
  const [rows] = await sequelize.query(
    `SELECT id, nombre FROM categorias ORDER BY nombre ASC`
  )
  res.json(rows)
}

export const getClases: RequestHandler = async (_req, res) => {
  const [rows] = await sequelize.query(
    `SELECT id, nombre, alias FROM clases ORDER BY nombre ASC`
  )
  res.json(rows)
}

export const getRegiones: RequestHandler = async (_req, res) => {
  const [rows] = await sequelize.query(
    `SELECT id, nombre FROM regiones ORDER BY nombre ASC`
  )
  res.json(rows)
}

export const getTelas: RequestHandler = async (req, res) => {
  const claseId = Number(req.query.clase_id)
  if (!claseId) {
    res.status(400).json({ message: "clase_id requerido" })
    return
  }
  const [rows] = await sequelize.query(
    `SELECT id, nombre FROM telas WHERE clase_id = :claseId ORDER BY nombre ASC`,
    { replacements: { claseId } }
  )
  res.json(rows)
}

export const getAccesorios: RequestHandler = async (req, res) => {
  try {
    const tipo = (req.query.tipo as string) || "normal"
    const [rows] = await sequelize.query(
      `SELECT id, nombre, categoria_tipo
       FROM accesorios
       WHERE categoria_tipo = :tipo
       ORDER BY nombre ASC`,
      { replacements: { tipo } }
    )
    res.json(rows)
  } catch (e) {
    console.error("Error en getAccesorios:", e)
    res
      .status(500)
      .json({ message: "Error al obtener accesorios", error: String(e) })
  }
}

export const getAccesorioTipos: RequestHandler = async (req, res) => {
  const accesorioId = Number(req.query.accesorio_id)
  if (!accesorioId) {
    res.status(400).json({ message: "accesorio_id requerido" })
    return
  }
  const [rows] = await sequelize.query(
    `SELECT id, nombre FROM accesorio_tipos WHERE accesorio_id = :accesorioId ORDER BY nombre ASC`,
    { replacements: { accesorioId } }
  )
  res.json(rows)
}

export const getAccesorioMateriales: RequestHandler = async (req, res) => {
  const accesorioId = Number(req.query.accesorio_id)
  if (!accesorioId) {
    res.status(400).json({ message: "accesorio_id requerido" })
    return
  }
  const [rows] = await sequelize.query(
    `SELECT id, nombre FROM accesorio_materiales WHERE accesorio_id = :accesorioId ORDER BY nombre ASC`,
    { replacements: { accesorioId } }
  )
  res.json(rows)
}

// ===========================
// Crear producto (con Supabase Storage)
// ===========================
export const createProduct: RequestHandler = async (req, res) => {
  try {
    const u: any = (req as any).user
    const b = req.body as any

    if (!b.nombre || !b.descripcion || !b.precio || !b.stock) {
      res.status(400).json({ message: "Campos obligatorios faltantes" })
      return
    }

    const precio = Number(b.precio)
    const stock = Number(b.stock)
    if (!Number.isFinite(precio) || precio <= 0) {
      res.status(400).json({ message: "Precio inválido" })
      return
    }
    if (!Number.isInteger(stock) || stock < 0) {
      res.status(400).json({ message: "Stock inválido" })
      return
    }

    // 📤 Subir imágenes a Supabase
    const files = (req.files as Express.Multer.File[]) || []
    const urls: string[] = []

    for (const f of files) {
      const filename = `products/${Date.now()}-${Math.round(
        Math.random() * 1e9
      )}-${f.originalname}`
      const { error } = await supabase.storage
        .from("productos")
        .upload(filename, f.buffer, { contentType: f.mimetype })
      if (error) throw error

      const { data } = supabase.storage.from("productos").getPublicUrl(filename)
      urls.push(data.publicUrl)
    }

    const primera = urls[0] ?? null

    const [inserted]: any = await sequelize.query(
      `INSERT INTO productos (
        vendedor_id, nombre, descripcion, precio, stock,
        categoria_id, clase_id, tela_id, region_id,
        accesorio_id, accesorio_custom,
        accesorio_tipo_id, accesorio_tipo_custom,
        accesorio_material_id, accesorio_material_custom,
        imagen_url, activo, created_at, updated_at
      ) VALUES (
        :vendedor_id, :nombre, :descripcion, :precio, :stock,
        :categoria_id, :clase_id, :tela_id, :region_id,
        :accesorio_id, :accesorio_custom,
        :accesorio_tipo_id, :accesorio_tipo_custom,
        :accesorio_material_id, :accesorio_material_custom,
        :imagen_url, :activo, now(), now()
      ) RETURNING id`,
      {
        replacements: {
          vendedor_id: u?.id ?? null,
          nombre: b.nombre,
          descripcion: b.descripcion,
          precio,
          stock,
          categoria_id: b.categoria_id ? Number(b.categoria_id) : null,
          clase_id: b.clase_id ? Number(b.clase_id) : null,
          tela_id: b.tela_id ? Number(b.tela_id) : null,
          region_id: b.region_id ? Number(b.region_id) : null,
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
      }
    )

    res.status(201).json({ id: inserted[0].id, imagenes: urls })
  } catch (e) {
    console.error("Error en createProduct:", e)
    res
      .status(500)
      .json({ message: "Error al crear producto", error: String(e) })
  }
}

// ===========================
// Listar productos del vendedor
// ===========================
export const getSellerProducts: RequestHandler = async (req, res) => {
  try {
    const u: any = (req as any).user
    if (!u?.id) {
      res.status(401).json({ message: "No autenticado" })
      return
    }

    const [rows] = await sequelize.query(
      `SELECT id, nombre, precio, stock, activo, imagen_url
       FROM productos
       WHERE vendedor_id = :vid
       ORDER BY created_at DESC`,
      { replacements: { vid: u.id } }
    )
    res.json(rows)
  } catch (e) {
    console.error("Error en getSellerProducts:", e)
    res
      .status(500)
      .json({ message: "Error al obtener productos", error: String(e) })
  }
}

// ===========================
// Obtener producto por ID
// ===========================
export const getProductById: RequestHandler = async (req, res) => {
  try {
    const u: any = (req as any).user
    const { id } = req.params
    const [rows]: any = await sequelize.query(
      `SELECT * FROM productos WHERE id = :id AND vendedor_id = :vid`,
      { replacements: { id, vid: u.id } }
    )
    if (!rows || rows.length === 0) {
      res.status(404).json({ message: "Producto no encontrado" })
      return
    }
    res.json(rows[0])
  } catch (e) {
    console.error("Error en getProductById:", e)
    res
      .status(500)
      .json({ message: "Error al obtener producto", error: String(e) })
  }
}

// ===========================
// Actualizar producto (con imagen nueva)
// ===========================
export const updateProduct: RequestHandler = async (req, res) => {
  try {
    const u: any = (req as any).user
    const { id } = req.params
    const b = req.body as any

    const [rows]: any = await sequelize.query(
      `SELECT id, imagen_url FROM productos WHERE id = :id AND vendedor_id = :vid`,
      { replacements: { id, vid: u.id } }
    )
    if (!rows || rows.length === 0) {
      res.status(404).json({ message: "Producto no encontrado" })
      return
    }

    const files = (req.files as Express.Multer.File[]) || []
    let nuevaUrl: string | null = null

    // 📤 Subir imagen nueva a Supabase (si se envía)
    if (files.length > 0) {
      const f = files[0]
      const filename = `products/${Date.now()}-${Math.round(
        Math.random() * 1e9
      )}-${f.originalname}`
      const { error } = await supabase.storage
        .from("productos")
        .upload(filename, f.buffer, { contentType: f.mimetype, upsert: true })
      if (error) throw error

      const { data } = supabase.storage.from("productos").getPublicUrl(filename)
      nuevaUrl = data.publicUrl
    }

    await sequelize.query(
      `UPDATE productos
       SET nombre = :nombre,
           descripcion = :descripcion,
           precio = :precio,
           stock = :stock,
           activo = :activo,
           imagen_url = COALESCE(:imagen_url, imagen_url),
           updated_at = now()
       WHERE id = :id AND vendedor_id = :vid`,
      {
        replacements: {
          id,
          vid: u.id,
          nombre: b.nombre,
          descripcion: b.descripcion || null,
          precio: Number(b.precio),
          stock: Number(b.stock),
          activo: b.activo === "true" || b.activo === true,
          imagen_url: nuevaUrl,
        },
      }
    )

    res.json({
      message: "✅ Producto actualizado correctamente",
      nuevaImagen: nuevaUrl,
    })
  } catch (e) {
    console.error("Error en updateProduct:", e)
    res
      .status(500)
      .json({ message: "Error al actualizar producto", error: String(e) })
  }
}

// ===========================
// Eliminar producto
// ===========================
export const deleteProduct: RequestHandler = async (req, res) => {
  try {
    const u: any = (req as any).user
    const { id } = req.params

    const [rows]: any = await sequelize.query(
      `SELECT id FROM productos WHERE id = :id AND vendedor_id = :vid`,
      { replacements: { id, vid: u.id } }
    )
    if (!rows || rows.length === 0) {
      res.status(404).json({ message: "Producto no encontrado" })
      return
    }

    await sequelize.query(
      `DELETE FROM productos WHERE id = :id AND vendedor_id = :vid`,
      { replacements: { id, vid: u.id } }
    )
    res.json({ message: "Producto eliminado correctamente" })
  } catch (e) {
    console.error("Error en deleteProduct:", e)
    res
      .status(500)
      .json({ message: "Error al eliminar producto", error: String(e) })
  }
}

// ===========================
// Activar / Desactivar producto
// ===========================
export const toggleProductActive: RequestHandler = async (req, res) => {
  try {
    const u: any = (req as any).user
    const { id } = req.params
    const { activo } = req.body

    const [rows]: any = await sequelize.query(
      `SELECT id FROM productos WHERE id = :id AND vendedor_id = :vid`,
      { replacements: { id, vid: u.id } }
    )
    if (!rows || rows.length === 0) {
      res.status(404).json({ message: "Producto no encontrado" })
      return
    }

    await sequelize.query(
      `UPDATE productos SET activo = :activo, updated_at = now()
       WHERE id = :id AND vendedor_id = :vid`,
      { replacements: { id, vid: u.id, activo: Boolean(activo) } }
    )
    res.json({ message: "Estado actualizado correctamente", activo })
  } catch (e) {
    console.error("Error en toggleProductActive:", e)
    res
      .status(500)
      .json({ message: "Error al cambiar estado", error: String(e) })
  }
}
