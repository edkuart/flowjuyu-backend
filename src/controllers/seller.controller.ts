// src/controllers/seller.controller.ts

import { Request, Response } from "express";
import { VendedorPerfil } from "../models/VendedorPerfil";
import { User } from "../models/user.model";

// ==============================
// Dashboard general del vendedor
// ==============================
export const getSellerDashboard = async (req: Request, res: Response): Promise<void> => {
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
// Pedidos del vendedor
// ==============================
export const getSellerOrders = async (_req: Request, res: Response): Promise<void> => {
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
// Productos del vendedor
// ==============================
export const getSellerProducts = async (_req: Request, res: Response): Promise<void> => {
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
// Perfil del vendedor
// ==============================
export const getSellerProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user?.id) {
      res.status(401).json({ ok: false, message: "Usuario no autenticado" });
      return;
    }

    const perfil = await VendedorPerfil.findOne({
      where: { user_id: user.id }, // 👈 usa el nombre real de columna
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

    res.json({
      ok: true,
      perfil,
    });
  } catch (error) {
    console.error("Error en getSellerProfile:", error);
    res.status(500).json({ ok: false, message: "Error al obtener perfil" });
  }
};

// ==============================
// Actualizar perfil
// ==============================
export const updateSellerProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user?.id) {
      res.status(401).json({ ok: false, message: "No autorizado" });
      return;
    }

    await VendedorPerfil.update(req.body, { where: { user_id: user.id } });
    res.json({ ok: true, message: "Perfil actualizado correctamente" });
  } catch (error) {
    console.error("Error en updateSellerProfile:", error);
    res.status(500).json({ ok: false, message: "Error al actualizar perfil" });
  }
};

// ==============================
// Enviar documentos de validación
// ==============================
export const validateSellerBusiness = async (_req: Request, res: Response): Promise<void> => {
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
