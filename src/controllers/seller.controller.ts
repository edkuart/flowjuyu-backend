import { Request, Response } from "express";

export const getSellerDashboard = (req: Request, res: Response) => {
  res.json({
    message: "Bienvenido al panel del vendedor",
    user: (req as any).user,
  });
};

export const getSellerOrders = (_req: Request, res: Response) => {
  res.json({ message: "Pedidos del vendedor" });
};

export const getSellerProducts = (_req: Request, res: Response) => {
  res.json({ message: "Productos del vendedor" });
};

export const getSellerProfile = (req: Request, res: Response) => {
  res.json({ message: "Perfil del vendedor", user: (req as any).user });
};

export const updateSellerProfile = (req: Request, res: Response) => {
  res.json({ message: "Perfil actualizado correctamente" });
};

export const validateSellerBusiness = (_req: Request, res: Response) => {
  res.json({ message: "Documentos enviados para validación del comercio" });
};
