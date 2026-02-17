import { RequestHandler } from "express";
import { VendedorPerfil } from "../models/VendedorPerfil";

export const updateVendorValidation: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const { estado, observaciones } = req.body;

    if (!id || isNaN(Number(id))) {
      res.status(400).json({ message: "ID inválido" });
      return;
    }

    if (!["aprobado", "rechazado"].includes(estado)) {
      res.status(400).json({
        message: "Estado inválido. Solo puede ser 'aprobado' o 'rechazado'",
      });
      return;
    }

    const perfil = await VendedorPerfil.findOne({
      where: { user_id: Number(id) },
    });

    if (!perfil) {
      res.status(404).json({ message: "Vendedor no encontrado" });
      return;
    }

    const updateFields: any = {
      estado_validacion: estado,
      actualizado_en: new Date(),
    };

    if (estado === "rechazado") {
      if (!observaciones) {
        res.status(400).json({
          message: "Debes enviar observaciones al rechazar",
        });
        return;
      }
      updateFields.observaciones = observaciones;
    }

    if (estado === "aprobado") {
      updateFields.observaciones = null;
    }

    await VendedorPerfil.update(updateFields, {
      where: { user_id: Number(id) },
    });

    res.json({
      ok: true,
      message: "Estado actualizado correctamente",
    });

  } catch (error) {
    console.error("Error en updateVendorValidation:", error);
    res.status(500).json({ message: "Error interno" });
  }
};
