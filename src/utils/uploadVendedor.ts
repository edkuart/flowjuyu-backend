// src/utils/uploadVendedor.ts
import multer from "multer";
import path from "path";
import fs from "fs";

const storage = multer.diskStorage({
  destination: function (_, __, cb) {
    const dir = "uploads/vendedores";
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: function (_, file, cb) {
    const ext = path.extname(file.originalname);
    const nombre = Date.now() + ext;
    cb(null, nombre);
  },
});

export const uploadVendedor = multer({ storage });
