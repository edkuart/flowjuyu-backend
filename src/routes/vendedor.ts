// src/routes/vendedor.ts
import { Router, Request, Response, RequestHandler } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { sequelize } from "../config/db";
import { QueryTypes } from "sequelize";
import { requireRole } from "../middleware/auth";

const router: Router = Router(); // 👈 tipo explícito

// ===========================
// Multer (subidas locales) — en prod: usar Supabase Storage
// ===========================
const UPLOAD_DIR = path.join(process.cwd(), "uploads", "vendedores");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) return cb(null, true);
    return cb(new Error("Solo se permiten imágenes"));
  },
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
});

// ===========================
// Handler tipado como RequestHandler
// ===========================
const upsertPerfil: RequestHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { id, nombre, email, telefono, direccion } = req.body;
    const archivo = req.file;

    if (!id) {
      res.status(400).json({ message: "Falta 'id' del vendedor" });
      return;
    }

    const rows = (await sequelize.query(
      "SELECT imagen_url FROM seller_profile WHERE id = $1",
      { bind: [id], type: QueryTypes.SELECT },
    )) as Array<{ imagen_url?: string | null }>;

    const anterior = rows[0]?.imagen_url;

    if (anterior && anterior.startsWith("/uploads/")) {
      const ruta = path.join(UPLOAD_DIR, path.basename(anterior));
      if (fs.existsSync(ruta)) {
        try {
          fs.unlinkSync(ruta);
        } catch {
          // no bloqueamos si falla
        }
      }
    }

    const nuevaURL = archivo
      ? `/uploads/vendedores/${archivo.filename}`
      : anterior ?? null;

    await sequelize.query(
      `INSERT INTO seller_profile (id, nombre, email, telefono, direccion, imagen_url)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         nombre = EXCLUDED.nombre,
         email = EXCLUDED.email,
         telefono = EXCLUDED.telefono,
         direccion = EXCLUDED.direccion,
         imagen_url = EXCLUDED.imagen_url,
         actualizado_en = CURRENT_TIMESTAMP`,
      {
        bind: [
          id,
          nombre ?? null,
          email ?? null,
          telefono ?? null,
          direccion ?? null,
          nuevaURL,
        ],
      },
    );

    res.status(200).json({
      message: "Perfil actualizado correctamente.",
      imagen_url: nuevaURL,
    });
  } catch (error) {
    console.error("Error al guardar perfil vendedor:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
};

// ===========================
// POST /perfil
// ===========================
router.post(
  "/perfil",
  requireRole("seller"),
  upload.single("logo"),
  upsertPerfil,
);

export default router;
