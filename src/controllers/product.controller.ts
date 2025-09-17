import { Request, Response } from "express"
import { sequelize } from "../config/db"
import multer from "multer"
import path from "path"
import fs from "fs"

const UPLOAD_DIR = path.join(process.cwd(), "uploads", "products")
fs.mkdirSync(UPLOAD_DIR, { recursive: true })

// ===========================
// Configuración de Multer
// ===========================
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) =>
    cb(
      null,
      `${Date.now()}-${Math.round(Math.random() * 1e9)}${path
        .extname(file.originalname)
        .toLowerCase()}`
    ),
})
const fileFilter: multer.Options["fileFilter"] = (_req, file, cb) =>
  /^image\/(png|jpe?g|webp|gif|avif)$/.test(file.mimetype)
    ? cb(null, true)
    : cb(new Error("Solo imágenes"))

export const uploadProductImages = multer({
  storage,
  limits: { files: 9, fileSize: 5 * 1024 * 1024 },
  fileFilter,
})

// ===========================
// GETs auxiliares
// ===========================
export const getCategorias = async (_req: Request, res: Response) => {
  const [rows] = await sequelize.query(
    `select id, nombre from categorias order by nombre asc`
  )
  res.json(rows)
}

export const getClases = async (_req: Request, res: Response) => {
  const [rows] = await sequelize.query(
    `select id, nombre, alias from clases order by nombre asc`
  )
  res.json(rows)
}

export const getRegiones = async (_req: Request, res: Response) => {
  const [rows] = await sequelize.query(
    `select id, nombre from regiones order by nombre asc`
  )
  res.json(rows)
}

export const getTelas = async (req: Request, res: Response) => {
  const claseId = Number(req.query.clase_id)
  if (!claseId) {
    res.status(400).json({ message: "clase_id requerido" })
    return
  }
  const [rows] = await sequelize.query(
    `select id, nombre from telas where clase_id = :claseId order by nombre asc`,
    { replacements: { claseId } }
  )
  res.json(rows)
}

// ===========================
// Crear producto
// ===========================
export const createProduct = async (req: Request, res: Response) => {
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

  const files = (req.files as Express.Multer.File[]) || []
  const urls = files.map((f) => `/uploads/products/${f.filename}`)
  const primera = urls[0] ?? null

  try {
    const [inserted]: any = await sequelize.query(
      `insert into productos (
        vendedor_id, nombre, descripcion, precio, stock,
        categoria_id, clase_id, tela_id, region_id,
        imagen_url, activo, created_at, updated_at
      ) values (
        :vendedor_id, :nombre, :descripcion, :precio, :stock,
        :categoria_id, :clase_id, :tela_id, :region_id,
        :imagen_url, :activo, now(), now()
      ) returning id`,
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
          imagen_url: primera,
          activo: b.activo === "true" || b.activo === true,
        },
      }
    )

    res.status(201).json({ id: inserted[0].id, imagenes: urls })
  } catch (e) {
    console.error("Error en createProduct:", e)
    res.status(500).json({ message: "Error al crear producto", error: String(e) })
  }
}

// ===========================
// Listar productos del vendedor
// ===========================
export const getSellerProducts = async (req: Request, res: Response) => {
  try {
    const u: any = (req as any).user
    if (!u?.id) {
      res.status(401).json({ message: "No autenticado" })
      return
    }

    const [rows] = await sequelize.query(
      `select id, nombre, precio, stock, activo, imagen_url
       from productos
       where vendedor_id = :vid
       order by created_at desc`,
      { replacements: { vid: u.id } }
    )

    res.json(rows)
  } catch (e) {
    console.error("Error en getSellerProducts:", e)
    res.status(500).json({ message: "Error al obtener productos", error: String(e) })
  }
}

export const getLatestProducts = async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit || "12"), 10), 50)

    const [rows] = await sequelize.query(
      `select
         id,
         nombre,
         precio,
         stock,
         imagen_url,
         activo,
         created_at
       from productos
       where activo = true
       order by created_at desc
       limit :limit`,
      { replacements: { limit } }
    )

    res.json({ ok: true, data: rows })
  } catch (e) {
    console.error("Error en getLatestProducts:", e)
    res.status(500).json({ ok: false, message: "Error obteniendo productos" })
  }
}



export const getAllProducts = async (_req: Request, res: Response) => {
  try {
    const [rows] = await sequelize.query(
      `select
         id,
         nombre,
         precio,
         stock,
         imagen_url,
         activo,
         created_at
       from productos
       order by created_at desc`
    )

    res.json({ ok: true, data: rows })
  } catch (e) {
    console.error("Error en getAllProducts:", e)
    res.status(500).json({ ok: false, message: "Error obteniendo productos" })
  }
}
