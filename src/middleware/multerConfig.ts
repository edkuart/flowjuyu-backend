// src/middleware/multerConfig.ts
import multer from "multer";
import path from "path";
import fs from "fs";

// Ruta base de almacenamiento local
const carpetaDestino = path.join(__dirname, "../../uploads/vendedores");

// Asegurar que exista la carpeta
if (!fs.existsSync(carpetaDestino)) {
  fs.mkdirSync(carpetaDestino, { recursive: true });
}

// Configuración de almacenamiento
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, carpetaDestino),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const nombreSeguro = `${file.fieldname}-${Date.now()}${ext}`;
    cb(null, nombreSeguro);
  },
});

// Filtro de archivos permitidos (solo imágenes)
const fileFilter: multer.Options["fileFilter"] = (_req, file, cb) => {
  const valid = /jpeg|jpg|png|webp/.test(file.mimetype);
  if (valid) cb(null, true);
  else cb(new Error("Formato de imagen no permitido"));
};

// Exportar middleware listo para usar
export const upload = multer({ storage, fileFilter });
