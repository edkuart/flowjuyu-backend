// src/controllers/buyer.controller.ts
import { Request, Response } from "express";
import Address from "../models/Address.model";

// ========================================
// Dashboard / Perfil / Órdenes
// ========================================
export const getBuyerDashboard = (req: Request, res: Response): void => {
  res.json({
    message: "Bienvenido al panel del comprador",
    user: (req as any).user,
  });
};

export const getBuyerOrders = (req: Request, res: Response): void => {
  res.json({ message: "Órdenes del comprador" });
};

export const getBuyerProfile = (req: Request, res: Response): void => {
  res.json({ message: "Perfil del comprador", user: (req as any).user });
};

export const updateBuyerProfile = (req: Request, res: Response): void => {
  res.json({ message: "Perfil actualizado" });
};

// ========================================
// Direcciones — YA FUNCIONA
// ========================================
export const createAddress = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;

    const nueva = await Address.create({
      user_id: user.id,
      nombre_receptor: req.body.nombre_receptor,
      apellido_receptor: req.body.apellido_receptor,
      telefono: req.body.telefono,
      departamento: req.body.departamento,
      municipio: req.body.municipio,
      direccion_exacta: req.body.direccion_exacta,
      referencia: req.body.referencia || null,
    });

    res.json({ message: "Dirección guardada", data: nueva });
  } catch (error) {
    console.error("Error creando dirección:", error);
    res.status(500).json({ message: "Error del servidor" });
  }
};

export const getAddresses = async (req: Request, res: Response): Promise<void> => {
  const user = (req as any).user;

  const direcciones = await Address.findAll({
    where: { user_id: user.id },
  });

  res.json(direcciones);
};

export const updateAddress = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    const id = req.params.id;

    // Buscar que esa dirección pertenece al usuario
    const address = await Address.findOne({
      where: { id, user_id: user.id },
    });

    if (!address) {
      res.status(404).json({ message: "Dirección no encontrada" });
      return;
    }

    const {
      nombre_receptor,
      apellido_receptor,
      telefono,
      departamento,
      municipio,
      direccion_exacta,
      referencia,
    } = req.body;

    await address.update({
      nombre_receptor,
      apellido_receptor,
      telefono,
      departamento,
      municipio,
      direccion_exacta,
      referencia: referencia || null,
    });

    res.json({ message: "Dirección actualizada correctamente", data: address });
  } catch (error) {
    console.error("Error actualizando dirección:", error);
    res.status(500).json({ message: "Error del servidor" });
  }
};

export const deleteAddress = async (req: Request, res: Response): Promise<void> => {
  const user = (req as any).user;
  const id = req.params.id;

  const deleted = await Address.destroy({
    where: {
      id,
      user_id: user.id,
    },
  });

  res.json({ message: "Dirección eliminada", deleted });
};

// ========================================
// Favoritos
// ========================================
export const getFavorites = (req: Request, res: Response): void => {
  res.json({ message: "Favoritos del comprador" });
};

export const addFavorite = (req: Request, res: Response): void => {
  res.json({ message: "Favorito agregado" });
};

export const removeFavorite = (req: Request, res: Response): void => {
  res.json({ message: "Favorito eliminado" });
};

// ========================================
// Reviews
// ========================================
export const getReviews = (req: Request, res: Response): void => {
  res.json({ message: "Opiniones del comprador" });
};

export const createReview = (req: Request, res: Response): void => {
  res.json({ message: "Opinión creada" });
};

export const deleteReview = (req: Request, res: Response): void => {
  res.json({ message: "Opinión eliminada" });
};

// ========================================
// Notificaciones
// ========================================
export const getNotifications = (req: Request, res: Response): void => {
  res.json({ message: "Lista de notificaciones" });
};

export const updateNotificationSettings = (req: Request, res: Response): void => {
  res.json({ message: "Configuración actualizada" });
};

// ========================================
// Tarjetas
// ========================================
export const getCards = (req: Request, res: Response): void => {
  res.json({ message: "Tarjetas guardadas" });
};

export const addCard = (req: Request, res: Response): void => {
  res.json({ message: "Tarjeta agregada" });
};

export const deleteCard = (req: Request, res: Response): void => {
  res.json({ message: "Tarjeta eliminada" });
};

// ========================================
// Garantías / Reclamos
// ========================================
export const getWarranties = (req: Request, res: Response): void => {
  res.json({ message: "Garantías en proceso" });
};

export const createWarrantyClaim = (req: Request, res: Response): void => {
  res.json({ message: "Reclamo creado" });
};
