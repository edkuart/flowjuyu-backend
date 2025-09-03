import express from "express"
import cors from "cors"
import helmet from "helmet"
import session from "express-session"
import pgSession from "connect-pg-simple"
import dotenv from "dotenv"
import path from "path"
import { Pool } from "pg"

import { sequelize } from "./config/db"
import { errorHandler } from "./middleware/errorHandler"

// 🔹 Rutas
import authRoutes from "./routes/auth.routes"       // /api/login, /api/register
import buyerRoutes from "./routes/buyer.routes"     // /api/buyer/...
import sellerRoutes from "./routes/seller.routes"   // /api/seller/...
import productRoutes from "./routes/product.routes" // /api/productos, /api/seller/productos

dotenv.config()
const app = express()
const PORT = process.env.PORT || 8800
const PgSession = pgSession(session)

// ===========================
// Middlewares globales
// ===========================
app.use(cors({ origin: "http://localhost:3000", credentials: true }))
app.use(helmet())
app.use(express.json())

// Archivos estáticos (imágenes subidas)
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")))

// ===========================
// Sesiones en Postgres
// ===========================
app.use(
  session({
    store: new PgSession({
      pool: new Pool({
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        database: process.env.DB_NAME,
        password: process.env.DB_PASSWORD,
        port: Number(process.env.DB_PORT),
      }),
      tableName: "sessions",
    }),
    secret: process.env.JWT_SECRET || "supersecret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24, // 1 día
      secure: false,
      httpOnly: true,
      sameSite: "lax",
    },
  })
)

// ===========================
// Montaje de rutas
// ===========================
app.use("/api", authRoutes)        // /api/login, /api/register
app.use("/api/buyer", buyerRoutes) // /api/buyer/...
app.use("/api/seller", sellerRoutes) // /api/seller/...
app.use("/api", productRoutes)     // 👈 ahora queda /api/productos, /api/seller/productos, etc.

// ===========================
// DB + Arranque
// ===========================
sequelize
  .authenticate()
  .then(() => {
    console.log("✅ Conectado a la base de datos")
    app.listen(PORT, () => console.log(`🚀 Servidor en http://localhost:${PORT}`))
  })
  .catch((err) => {
    console.error("❌ Error de conexión a la base de datos:", err)
  })

// ===========================
// Manejo global de errores
// ===========================
app.use(errorHandler)
