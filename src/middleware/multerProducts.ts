import multer from "multer";

// Configuración en memoria (para subir luego a Supabase)
const storage = multer.memoryStorage();

// Filtro de archivos permitidos (solo imágenes)
const fileFilter: multer.Options["fileFilter"] = (_req, file, cb) => {
  const valid = /^image\/(png|jpe?g|webp|gif|avif)$/.test(file.mimetype);
  if (valid) cb(null, true);
  else cb(new Error("Formato de imagen no permitido"));
};

// ✅ Export usado en product.routes.ts
export const uploadProductImages = multer({
  storage,
  limits: { files: 9, fileSize: 5 * 1024 * 1024 },
  fileFilter,
});
