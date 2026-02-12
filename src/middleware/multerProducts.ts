//src/middleware/multerProducts.ts

import multer from "multer";

const storage = multer.memoryStorage();

const fileFilter: multer.Options["fileFilter"] = (_req, file, cb) => {
  const valid = /^image\/(png|jpe?g|webp|gif|avif)$/.test(file.mimetype);
  if (valid) cb(null, true);
  else cb(new Error("Formato de imagen no permitido"));
};

export const uploadProductImages = multer({
  storage,
  limits: { 
    files: 5, // 🔥 CAMBIADO DE 9 → 5
    fileSize: 5 * 1024 * 1024 
  },
  fileFilter,
});
