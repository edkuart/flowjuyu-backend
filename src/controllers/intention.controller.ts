import type { Request, Response } from "express";
import { PurchaseIntention } from "../models/purchaseIntention.model";

export const createPurchaseIntention = async (
  req: Request,
  res: Response
) => {
  try {
    const { product_id, seller_id, source } = req.body;
    const user: any = (req as any).user || null;

    if (!seller_id) {
      return res.status(400).json({ message: "seller_id requerido" });
    }

    await PurchaseIntention.create({
      product_id: product_id ?? null,
      seller_id,
      user_id: user?.id ?? null,
      source: source ?? "store_whatsapp",
    });

    return res.json({ success: true });

  } catch (error) {
    console.error("Error creando intención:", error);
    return res.status(500).json({ message: "Error interno" });
  }
};