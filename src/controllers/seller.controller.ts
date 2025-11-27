// src/controllers/seller.controller.ts
import { Request, Response, RequestHandler } from "express";
import { VendedorPerfil } from "../models/VendedorPerfil";
import { User } from "../models/user.model";
import { sequelize } from "../config/db";
import supabase from "../lib/supabase";
import { v4 as uuidv4 } from "uuid";

// ==============================
// Dashboard general del vendedor
// ==============================
export const getSellerDashboard: RequestHandler = async (req, res) => {
  try {
    const user = (req as any).user;
    res.json({
      ok: true,
      message: "Bienvenido al panel del vendedor",
      user,
    });
  } catch (error) {
    console.error("Error en getSellerDashboard:", error);
    res.status(500).json({ ok: false, message: "Error al cargar el dashboard" });
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
// Productos del vendedor (pendiente)
// ==============================
export const getSellerProducts: RequestHandler = async (_req, res) => {
  try {
    res.json({
      ok: true,
      message: "Productos del vendedor (pendiente de implementar)",
      data: [],
    });
  } catch (error) {
    console.error("Error en getSellerProducts:", error);
    res.status(500).json({ ok: false, message: "Error al obtener productos" });
  }
};

// ==============================
// 🔹 Obtener perfil del vendedor (autenticado o público)
// ==============================
export const getSellerProfile = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user || null;
    const { id } = req.params;

    const targetId = id || user?.id;
    if (!targetId) {
      return res.status(401).json({ ok: false, message: "Usuario no autenticado" });
    }

    const perfil = await VendedorPerfil.findOne({
      where: { user_id: targetId },
      include: [{ model: User, as: "user", attributes: ["id", "nombre", "correo", "rol"] }],
    });

    if (!perfil) {
      return res.status(404).json({ ok: false, message: "Perfil no encontrado" });
    }

    const esPropietario = Number(user?.id) === Number(perfil.user_id);
    if (!esPropietario) {
      return res.json({
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
// 🔹 Actualizar perfil del vendedor autenticado
// ==============================
export const updateSellerProfile = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user?.id) {
      return res.status(401).json({ ok: false, message: "No autorizado" });
    }

    const perfil = await VendedorPerfil.findOne({ where: { user_id: user.id } });
    if (!perfil) {
      return res.status(404).json({ ok: false, message: "Perfil no encontrado" });
    }

    // 🧩 Manejo de logo (subida, reemplazo o eliminación)
    let logoUrl = perfil.logo;

    // Eliminar logo
    if (req.body.logo === null || req.body.logo === "null") {
      if (perfil.logo) {
        const prevFile = perfil.logo.split("/").pop();
        if (prevFile) {
          await supabase.storage.from("vendedores").remove([`vendedores/${prevFile}`]);
        }
      }
      logoUrl = null;
    }

    // Subir nuevo logo
    if (req.file) {
      if (perfil.logo) {
        const prevFile = perfil.logo.split("/").pop();
        if (prevFile) {
          await supabase.storage.from("vendedores").remove([`vendedores/${prevFile}`]);
        }
      }

      const fileExt = req.file.originalname.split(".").pop();
      const fileName = `vendedores/${uuidv4()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from("vendedores")
        .upload(fileName, req.file.buffer, {
          contentType: req.file.mimetype,
        });

      if (uploadError) throw uploadError;

      const { data: publicUrl } = supabase.storage.from("vendedores").getPublicUrl(fileName);
      logoUrl = publicUrl.publicUrl;
    }

    // 🧩 Campos actualizables
    const fields = {
      nombre_comercio: req.body.nombre_comercio ?? perfil.nombre_comercio,
      descripcion: req.body.descripcion ?? perfil.descripcion,
      telefono_comercio: req.body.telefono_comercio ?? perfil.telefono_comercio,
      direccion: req.body.direccion ?? perfil.direccion,
      departamento: req.body.departamento ?? perfil.departamento,
      municipio: req.body.municipio ?? perfil.municipio,
      logo: logoUrl,
      updatedAt: new Date(),
    };

    await VendedorPerfil.update(fields, { where: { user_id: user.id } });
    const actualizado = await VendedorPerfil.findOne({ where: { user_id: user.id } });

    res.json({ ok: true, message: "Perfil actualizado correctamente", perfil: actualizado });
  } catch (error: any) {
    console.error("❌ Error en updateSellerProfile:", error.message);
    res.status(500).json({ ok: false, message: "Error al actualizar perfil", error: error.message });
  }
};

// ==============================
// Validación de comercio (pendiente)
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

// ==================================================
// 🏪 Obtener tiendas (vendedores) registradas (público)
// ==================================================
export const getSellers: RequestHandler = async (_req, res) => {
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
