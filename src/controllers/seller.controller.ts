// src/controllers/seller.controller.ts
import { Request, Response, RequestHandler } from "express";
import { VendedorPerfil } from "../models/VendedorPerfil";
import { QueryTypes } from "sequelize";
import { User } from "../models/user.model";
import { sequelize } from "../config/db";
import supabase from "../lib/supabase";
import Product from "../models/product.model";
import { v4 as uuidv4 } from "uuid";

// ==============================
// Dashboard general del vendedor
// ==============================
export const getSellerDashboard: RequestHandler = async (req, res) => {
  try {
    const user = (req as any).user;

    if (!user || (user.rol !== "seller" && user.rol !== "vendedor")) {
      res.status(403).json({ message: "No autorizado" });
      return;
    }

    const vendedorId = user.id;

    // ============================
    // 📦 Métricas de productos
    // ============================
    const [productoStats]: any = await sequelize.query(
      `
      SELECT
        COUNT(*)::int AS total_productos,
        COUNT(*) FILTER (WHERE activo = true)::int AS activos,
        COUNT(*) FILTER (WHERE activo = false)::int AS inactivos,
        COUNT(*) FILTER (WHERE stock < 5 AND activo = true)::int AS stock_bajo
      FROM productos
      WHERE vendedor_id = :vid
      `,
      {
        replacements: { vid: vendedorId },
        type: QueryTypes.SELECT,
      }
    );

    // ============================
    // 📊 KPIs base (ventas aún no implementadas)
    // ============================
    const kpi = {
      ventasMes: 0,
      pedidosMes: 0,
      ticketPromedio: 0,
      productosActivos: productoStats.activos ?? 0,
    };

    res.json({
      kpi,

      productoStats: {
        total: productoStats.total_productos ?? 0,
        activos: productoStats.activos ?? 0,
        inactivos: productoStats.inactivos ?? 0,
        stock_bajo: productoStats.stock_bajo ?? 0,
      },

      // 🔜 placeholders conscientes (no fake data)
      ventasPorMes: [],
      topCategorias: [],
      actividad: [],
      lowStock: [],
      validaciones: [],
    });
  } catch (error) {
    console.error("Error en getSellerDashboard:", error);
    res.status(500).json({
      message: "Error al cargar el dashboard del vendedor",
    });
  }
};

export const getSellerKpis: RequestHandler = async (req, res) => {
  try {
    const user = (req as any).user;
    if (!user?.id) {
      res.status(401).json({ message: "No autenticado" });
      return;
    }

    // 🔹 Ventas y pedidos (placeholder realista)
    const [ventas]: any = await sequelize.query(
      `
      SELECT 
        COALESCE(SUM(total), 0) AS ventasMes,
        COUNT(*) AS pedidosMes
      FROM pedidos
      WHERE vendedor_id = :vid
      AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())
      `,
      { replacements: { vid: user.id } }
    );

    const ventasMes = Number(ventas[0]?.ventasmes ?? 0);
    const pedidosMes = Number(ventas[0]?.pedidosmes ?? 0);

    res.json({
      ventasMes,
      pedidosMes,
      ticketPromedio: pedidosMes ? ventasMes / pedidosMes : 0,
      productosActivos: 0, // lo llenamos luego
    });
  } catch (e) {
    console.error("Error KPIs:", e);
    res.status(500).json({ message: "Error al obtener KPIs" });
  }
};

// ==============================
// Pedidos del vendedor (pendiente)
// ==============================
export const getSellerOrders: RequestHandler = async (_req, res) => {
  try {
    res.json({
      ok: true,
      message: "Pedidos del vendedor (pendiente de implementar)",
      data: [],
    });
  } catch (error) {
    console.error("Error en getSellerOrders:", error);
    res.status(500).json({ ok: false, message: "Error al obtener pedidos" });
  }
};

// ==============================
// Productos del vendedor autenticado
// ==============================
export const getSellerProducts: RequestHandler = async (req, res) => {
  try {
    const u: any = (req as any).user;
    if (!u?.id) {
      res.status(401).json({ message: "No autenticado" });
      return;
    }

    const [rows]: any = await sequelize.query(
      `SELECT id, nombre, precio, stock, activo, imagen_url
       FROM productos
       WHERE vendedor_id = :vid
       ORDER BY created_at DESC`,
      { replacements: { vid: u.id } }
    );

    res.json(rows);
  } catch (e) {
    console.error("❌ Error en getSellerProducts:", e);
    res.status(500).json({ message: "Error al obtener productos", error: String(e) });
  }
};

// ==============================
// Obtener perfil del vendedor (autenticado o público)
// ==============================
export const getSellerProfile: RequestHandler = async (req, res): Promise<void> => {
  try {
    const user = (req as any).user || null;
    const { id } = req.params;

    if (id && isNaN(Number(id))) {
      res.status(400).json({ ok: false, message: "El parámetro 'id' debe ser numérico" });
      return;
    }

    const targetId = id || user?.id;
    if (!targetId) {
      res.status(401).json({ ok: false, message: "Usuario no autenticado" });
      return;
    }

    const perfil = await VendedorPerfil.findOne({
      where: { user_id: targetId },
      include: [
        {
          model: User,
          as: "user",
          attributes: ["id", "nombre", "correo", "rol"],
        },
      ],
    });

    if (!perfil) {
  res.status(404).json({ ok: false, message: "Perfil no encontrado" });
  return;
}


    const esPropietario = Number(user?.id) === Number(perfil.user_id);
    if (!esPropietario) {
       res.json({
        id: perfil.id,
        nombre_comercio: perfil.nombre_comercio,
        descripcion: perfil.descripcion,
        logo: perfil.logo,
        departamento: perfil.departamento,
        municipio: perfil.municipio,
      });
    }

    res.json(perfil);
  } catch (error) {
    console.error("Error en getSellerProfile:", error);
    res.status(500).json({ ok: false, message: "Error al obtener perfil" });
  }
};

// ==============================
// Actualizar perfil del vendedor
// ==============================
export const updateSellerProfile: RequestHandler = async (req, res): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user?.id) {
      res.status(401).json({ ok: false, message: "No autorizado" });
    return;

    }

    const perfil = await VendedorPerfil.findOne({ where: { user_id: user.id } });
    if (!perfil) {
      res.status(404).json({ ok: false, message: "Perfil no encontrado" });
      return;
    }

    let logoUrl = perfil.logo;

    // 🧹 Eliminar logo explícitamente (primer archivo lo hacía)
    if (req.body.logo === null || req.body.logo === "null") {
      if (perfil.logo) {
        const prevFile = perfil.logo.split("/").pop();
        if (prevFile) {
          await supabase.storage.from("logos_comercios")
          .remove([`vendedores/${prevFile}`]);
        }
      }
      logoUrl = null;
    }

    // 🖼 Subir nuevo logo
    if (req.file) {
      if (perfil.logo) {
        const prevFile = perfil.logo.split("/").pop();
        if (prevFile) {
          await supabase.storage.from("logos_comercios").remove([`vendedores/${prevFile}`]);
        }
      }

      const ext = req.file.originalname.split(".").pop();
      const fileName = `vendedores/${uuidv4()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("logos_comercios")
        .upload(fileName, req.file.buffer, { contentType: req.file.mimetype });

      if (uploadError) throw uploadError;

      const { data: publicUrl } = supabase.storage
        .from("logos_comercios")
        .getPublicUrl(fileName);

      logoUrl = publicUrl.publicUrl;
    }

    const fieldsToUpdate = {
      nombre_comercio: req.body.nombre_comercio ?? perfil.nombre_comercio,
      descripcion: req.body.descripcion ?? perfil.descripcion,
      telefono_comercio: req.body.telefono_comercio ?? perfil.telefono_comercio,
      direccion: req.body.direccion ?? perfil.direccion,
      departamento: req.body.departamento ?? perfil.departamento,
      municipio: req.body.municipio ?? perfil.municipio,
      logo: logoUrl,
      updatedAt: new Date(),
    };

    await VendedorPerfil.update(fieldsToUpdate, { where: { user_id: user.id } });

    const updatedPerfil = await VendedorPerfil.findOne({ where: { user_id: user.id } });

    res.json({
      ok: true,
      message: "Perfil actualizado correctamente",
      perfil: updatedPerfil,
    });
  } catch (error: any) {
    console.error("❌ Error en updateSellerProfile:", error);
    res.status(500).json({
      ok: false,
      message: "Error al actualizar perfil",
      error: error.message,
    });
  }
};

// ==============================
// Validación de comercio
// ==============================
export const validateSellerBusiness: RequestHandler = async (_req, res) => {
  try {
    res.json({
      ok: true,
      message: "Documentos enviados para validación del comercio (pendiente de implementar)",
    });
  } catch (error) {
    console.error("Error en validateSellerBusiness:", error);
    res.status(500).json({ ok: false, message: "Error al procesar validación" });
  }
};

// ==============================
// Listado público de vendedores
// ==============================
export const getSellers: RequestHandler = async (_req, res): Promise<void> => {
  try {
    const [rows]: any = await sequelize.query(`
      SELECT 
        id,
        COALESCE(nombre_comercio, nombre, 'Tienda sin nombre') AS nombre,
        logo AS logo_url,
        descripcion,
        departamento,
        municipio,
        "createdAt"
      FROM vendedor_perfil
      WHERE estado IS NULL OR estado != 'eliminado'
      ORDER BY "createdAt" DESC
      LIMIT 10
    `);

    res.json(rows ?? []);
  } catch (error: any) {
    console.error("Error al obtener tiendas:", error);
    res.status(500).json({ message: "Error al obtener tiendas", error: error.message });
  }
};

export const getTopSellers = async (req: Request, res: Response) => {
  try {
    const sellers = await sequelize.query(
      `
      SELECT
        vp.user_id AS vendedor_id,
        vp.nombre_comercio,
        vp.logo,
        COUNT(r.id) AS total_reviews,
        COALESCE(ROUND(AVG(r.rating)::numeric, 2), 0) AS rating_avg,
        (
          (COUNT(r.id)::float / (COUNT(r.id) + 5)) * COALESCE(AVG(r.rating), 0)
          +
          (5.0 / (COUNT(r.id) + 5)) * 3.5
        ) AS weighted_score
      FROM vendedor_perfil vp
      LEFT JOIN productos p ON p.vendedor_id = vp.user_id
      LEFT JOIN reviews r ON r.producto_id = p.id
      GROUP BY vp.user_id, vp.nombre_comercio, vp.logo
      ORDER BY weighted_score DESC NULLS LAST
      `,
      { type: QueryTypes.SELECT }
    );

    const normalized = (sellers as any[]).map((s) => ({
      vendedor_id: Number(s.vendedor_id),
      nombre_comercio: s.nombre_comercio,
      logo: s.logo,
      total_reviews: Number(s.total_reviews),
      rating_avg: Number(Number(s.rating_avg).toFixed(2)),
      weighted_score: Number(Number(s.weighted_score).toFixed(3)),
    }));

    res.json({
      success: true,
      data: normalized,
    });

  } catch (error) {
    console.error("Error obteniendo top sellers:", error);
    res.status(500).json({ message: "Error interno" });
  }
};

// ==============================
// Vista pública completa de tienda
// ==============================
export const getPublicSellerStore: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(Number(id))) {
      res.status(400).json({ message: "ID inválido" });
      return;
    }

    // 1️⃣ Obtener info del vendedor
    const seller: any = await sequelize.query(
      `
      SELECT 
        vp.user_id AS id,
        vp.nombre_comercio,
        vp.descripcion,
        vp.logo,
        vp.departamento,
        vp.municipio
      FROM vendedor_perfil vp
      WHERE vp.user_id = :id
      `,
      {
        replacements: { id },
        type: QueryTypes.SELECT,
      }
    );

    if (!seller || seller.length === 0) {
      res.status(404).json({ message: "Vendedor no encontrado" });
      return;
    }

    const sellerData = seller[0];

    // 2️⃣ Productos activos del vendedor
    const products: any = await sequelize.query(
      `
      SELECT 
        p.id,
        p.nombre,
        p.precio,
        p.imagen_url,
        p.departamento,
        p.municipio
      FROM productos p
      WHERE p.vendedor_id = :id
      AND p.activo = true
      ORDER BY p.created_at DESC
      `,
      {
        replacements: { id },
        type: QueryTypes.SELECT,
      }
    );

    // 3️⃣ Rating agregado de la tienda
    const rating: any = await sequelize.query(
      `
      SELECT 
        COUNT(r.id) AS rating_count,
        COALESCE(ROUND(AVG(r.rating)::numeric, 2), 0) AS rating_avg
      FROM productos p
      LEFT JOIN reviews r ON r.producto_id = p.id
      WHERE p.vendedor_id = :id
      `,
      {
        replacements: { id },
        type: QueryTypes.SELECT,
      }
    );

    const ratingData = rating[0];

    res.json({
      seller: {
        ...sellerData,
        rating_avg: Number(ratingData.rating_avg),
        rating_count: Number(ratingData.rating_count),
      },
      products: products ?? [],
      stats: {
        total_products: products.length,
        total_reviews: Number(ratingData.rating_count),
      },
    });
  } catch (error) {
    console.error("Error en getPublicSellerStore:", error);
    res.status(500).json({ message: "Error interno" });
  }
};