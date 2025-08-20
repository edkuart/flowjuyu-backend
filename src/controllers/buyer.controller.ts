import { Request, Response } from "express";

export const getBuyerDashboard = (req: Request, res: Response) => {
  res.json({ message: "Bienvenido al panel del comprador", user: (req as any).user });
};

export const getBuyerOrders = (_req: Request, res: Response) => {
  res.json({ message: "Órdenes del comprador" });
};

export const getBuyerProfile = (req: Request, res: Response) => {
  res.json({ message: "Perfil del comprador", user: (req as any).user });
};

export const updateBuyerProfile = (req: Request, res: Response) => {
  res.json({ message: "Perfil del comprador actualizado" });
};
