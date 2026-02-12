// src/controllers/seller.controller.ts
import { Request, Response, RequestHandler } from "express";
import { VendedorPerfil } from "../models/VendedorPerfil";
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
      res.status(403).json({
        message: "No autorizado",
      });
      return;
    }

    // ⚠️ MOCK TEMPORAL — estructura FINAL esperada por el frontend
    res.json({
      kpi: {
        ventasMes: 3200,
        pedidosMes: 22,
        ticketPromedio: 145.45,
        productosActivos: 10,
      },

      ventasPorMes: [
        { mes: "Ene", ventas: 800 },
        { mes: "Feb", ventas: 1100 },
        { mes: "Mar", ventas: 950 },
        { mes: "Abr", ventas: 1200 },
        { mes: "May", ventas: 600 },
        { mes: "Jun", ventas: 1300 },
        { mes: "Jul", ventas: 500 },
        { mes: "Ago", ventas: 1000 },
        { mes: "Sep", ventas: 1150 },
        { mes: "Oct", ventas: 950 },
        { mes: "Nov", ventas: 1250 },
        { mes: "Dic", ventas: 1400 },
      ],

      topCategorias: [
        { name: "Blusas", value: 8 },
        { name: "Trajes", value: 6 },
        { name: "Carteras", value: 4 },
        { name: "Accesorios", value: 3 },
        { name: "Otros", value: 2 },
      ],

      actividad: [
        {
          id: "1249",
          cliente: "Ana López",
          total: 120,
          estado: "Entregado",
          fecha: "2025-06-24",
        },
        {
          id: "1250",
          cliente: "Carlos Pérez",
          total: 330,
          estado: "En camino",
          fecha: "2025-06-23",
        },
        {
          id: "1251",
          cliente: "Luis García",
          total: 90,
          estado: "Pendiente",
          fecha: "2025-06-22",
        },
      ],

      lowStock: [
        { id: "P-101", nombre: "Blusa roja bordada", stock: 2 },
        { id: "P-143", nombre: "Faja multicolor", stock: 1 },
      ],

      validaciones: ["Selfie con DPI pendiente"],
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
