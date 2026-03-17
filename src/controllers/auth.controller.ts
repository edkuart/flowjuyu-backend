// src/controllers/auth.controller.ts

import { Request, Response, RequestHandler } from "express";
import bcrypt from "bcrypt";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { sequelize } from "../config/db";
import { User } from "../models/user.model";
import { VendedorPerfil } from "../models/VendedorPerfil";
import { sendResetPasswordEmail } from "../services/email.service";
import { runKYCAnalysis } from "../services/kyc.service";
import supabase from "../lib/supabase";
import { v4 as uuidv4 } from "uuid";

// ────────────────────────────────────────────────────────────
// Utilidad JWT
// ────────────────────────────────────────────────────────────
const generateToken = (payload: object) =>
  jwt.sign(payload, process.env.JWT_SECRET || "cortes_secret", {
    expiresIn: "1d",
  });

// ────────────────────────────────────────────────────────────
// Registro general (comprador)
// ────────────────────────────────────────────────────────────
export const register = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { nombre, correo, rol, telefono, direccion } = req.body;

    const plain =
      req.body["contraseña"] ??
      req.body["contrasena"] ??
      req.body["password"];

    if (!nombre || !correo || !plain || !rol) {
      res.status(400).json({ message: "Faltan campos obligatorios" });
      return;
    }

    const usuarioExistente = await User.findOne({ where: { correo } });
    if (usuarioExistente) {
      res.status(409).json({ message: "El correo ya está registrado" });
      return;
    }

    const hash = await bcrypt.hash(String(plain), 10);

    const nuevoUsuario = await User.create({
      nombre,
      correo,
      password: hash,
      rol,
      telefono: (telefono ?? "").toString().trim(),
      direccion: (direccion ?? "").toString().trim(),
    });

    const token = generateToken({
      id: nuevoUsuario.id,
      correo: nuevoUsuario.correo,
      rol: nuevoUsuario.rol,
      token_version: nuevoUsuario.token_version,
    });

    res.status(201).json({
      message: "Usuario registrado correctamente",
      token,
      user: {
        id: nuevoUsuario.id,
        nombre: nuevoUsuario.nombre,
        correo: nuevoUsuario.correo,
        rol: nuevoUsuario.rol,
        telefono: nuevoUsuario.telefono,
        direccion: nuevoUsuario.direccion,
      },
    });
  } catch (error) {
    console.error("Error en register:", error);
    res.status(500).json({ message: "Error al registrar" });
  }
};

// ────────────────────────────────────────────────────────────
// Registro exclusivo para vendedores
// ────────────────────────────────────────────────────────────
interface MulterFilesMap {
  [fieldname: string]: Express.Multer.File[] | undefined;
}

export const registerVendedor = async (
  req: Request,
  res: Response
): Promise<void> => {
  const t = await sequelize.transaction();

  try {
    const {
      nombre,
      correo,
      telefono,
      password,
      nombreComercio,
      telefonoComercio,
      direccion,
      departamento,
      municipio,
      descripcion,
      dpi,
    } = req.body;

    if (!nombre || !correo || !password || !dpi || !nombreComercio) {
      res.status(400).json({ message: "Faltan campos obligatorios" });
      return;
    }

    const usuarioExistente = await User.findOne({ where: { correo } });
    if (usuarioExistente) {
      res.status(409).json({ message: "El correo ya está registrado" });
      return;
    }

    // 🔐 Hash password
    const hash = await bcrypt.hash(String(password), 10);

    // 👤 Crear usuario
    const nuevoUsuario = await User.create(
      {
        nombre,
        correo,
        password: hash,
        rol: "seller",
        telefono: (telefono ?? "").toString().trim(),
        direccion: (direccion ?? "").toString().trim(),
      },
      { transaction: t }
    );

    console.log("🔥 FILES RECIBIDOS EN REGISTER:", req.files);

    // 📁 Obtener archivos
    const files = (req.files as MulterFilesMap | undefined) || {};

    // 🔥 Helper para subir a Supabase
    async function uploadToSupabase(
      file: Express.Multer.File,
      folder: string
    ): Promise<string> {
      const ext = file.originalname.split(".").pop();
      const fileName = `${folder}/${uuidv4()}.${ext}`;

      const { error } = await supabase.storage
        .from("vendedores_dpi")
        .upload(fileName, file.buffer, {
          contentType: file.mimetype,
          upsert: false,
        });

      if (error) {
        throw new Error(`Error subiendo a Supabase: ${error.message}`);
      }

      const { data: urlData } = supabase.storage
        .from("vendedores_dpi")
        .getPublicUrl(fileName);

      return urlData.publicUrl;
    }

    // 📤 Subir documentos si existen
    let fotoFrente: string | null = null;
    let fotoReverso: string | null = null;
    let selfie: string | null = null;
    let logo: string | null = null;

    if (files["foto_dpi_frente"]?.[0]) {
      fotoFrente = await uploadToSupabase(
        files["foto_dpi_frente"][0],
        "dpi_frente"
      );
    }

    if (files["foto_dpi_reverso"]?.[0]) {
      fotoReverso = await uploadToSupabase(
        files["foto_dpi_reverso"][0],
        "dpi_reverso"
      );
    }

    if (files["selfie_con_dpi"]?.[0]) {
      selfie = await uploadToSupabase(
        files["selfie_con_dpi"][0],
        "selfie"
      );
    }

    if (files["logo"]?.[0]) {
      logo = await uploadToSupabase(
        files["logo"][0],
        "logos"
      );
    }

    // 🔍 Automated KYC analysis
    const kyc = runKYCAnalysis({
      dpi:         dpi.trim(),
      fotoFrente,
      fotoReverso,
      selfie,
    });

    // Auto-approval: if KYC score >= 80, approve immediately
    const autoApproved = kyc.score >= 80;
    const estadoValidacion = autoApproved
      ? "aprobado"
      : (fotoFrente || fotoReverso || selfie) ? "en_revision" : "pendiente";
    const estadoAdmin = autoApproved ? "activo" : "inactivo";

    // 🏪 Crear perfil vendedor
    await VendedorPerfil.create(
      {
        user_id: nuevoUsuario.id,

        // Datos personales
        nombre: nombre.trim(),
        email: correo.toLowerCase().trim(),
        telefono: telefono ? telefono.trim() : null,
        direccion: direccion ? direccion.trim() : null,

        // Comercio
        logo: logo,
        nombre_comercio: nombreComercio.trim(),
        telefono_comercio: telefonoComercio
          ? telefonoComercio.trim()
          : null,
        departamento: departamento ?? null,
        municipio: municipio ?? null,
        descripcion: descripcion ?? null,

        // KYC
        dpi: dpi.trim(),
        foto_dpi_frente: fotoFrente,
        foto_dpi_reverso: fotoReverso,
        selfie_con_dpi: selfie,

        // Estados
        estado_validacion: estadoValidacion,
        estado_admin:      estadoAdmin,
        observaciones:     null,
        actualizado_en:    new Date(),

        // Automated KYC scoring
        kyc_score:     kyc.score,
        kyc_riesgo:    kyc.riesgo,
        kyc_checklist: kyc.checklist,
      } as any,
      { transaction: t }
    );

    await t.commit();

    // 🔑 Token
    const token = generateToken({
      id: nuevoUsuario.id,
      correo: nuevoUsuario.correo,
      rol: nuevoUsuario.rol,
      token_version: nuevoUsuario.token_version,
    });

    res.status(201).json({
      message: "Vendedor registrado correctamente",
      token,
      user: {
        id: nuevoUsuario.id,
        nombre: nuevoUsuario.nombre,
        correo: nuevoUsuario.correo,
        rol: nuevoUsuario.rol,
        telefono: nuevoUsuario.telefono,
        direccion: nuevoUsuario.direccion,
      },
    });

  } catch (error) {
    await t.rollback();
    console.error("Error en registerVendedor:", error);
    res.status(500).json({ message: "Error al registrar vendedor" });
  }
};

// ────────────────────────────────────────────────────────────
// Login
// ────────────────────────────────────────────────────────────
export const login = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { correo } = req.body;
    const plain =
      req.body["contraseña"] ??
      req.body["contrasena"] ??
      req.body["password"];

    if (!correo || !plain) {
      res.status(400).json({
        message: "Correo y contraseña son obligatorios",
      });
      return;
    }

    const usuario = await User.findOne({ where: { correo } });

    if (!usuario) {
      res.status(401).json({
        message: "Correo o contraseña incorrectos",
      });
      return;
    }

    const passwordValida = await bcrypt.compare(
      String(plain),
      usuario.password
    );

    if (!passwordValida) {
      res.status(401).json({
        message: "Correo o contraseña incorrectos",
      });
      return;
    }

    // 🔒 BLOQUEO SI ES SELLER SUSPENDIDO
    let sellerStatus: any = null;

    if (usuario.rol === "seller") {
      const perfil = await VendedorPerfil.findOne({
        where: { user_id: usuario.id },
      });

      if (perfil) {

        // 🚫 Bloqueo si está suspendido
        if (perfil.estado_admin === "suspendido") {
          res.status(403).json({
            message: "Cuenta suspendida por administración",
          });
          return;
        }

        // 🚫 Bloqueo si fue rechazado
        if (perfil.estado_validacion === "rechazado") {
          res.status(403).json({
            message: "Tu solicitud fue rechazada. Contacta soporte.",
          });
          return;
        }

        // 🔥 Guardamos estado para enviarlo al frontend
        sellerStatus = {
          estado_validacion: perfil.estado_validacion,
          estado_admin: perfil.estado_admin,
        };
      }
    }

    const token = generateToken({
      id: usuario.id,
      correo: usuario.correo,
      rol: usuario.rol,
      token_version: usuario.token_version,
    });

    res.status(200).json({
      message: "Inicio de sesión exitoso",
      token,
      user: {
        id: usuario.id,
        nombre: usuario.nombre,
        correo: usuario.correo,
        rol: usuario.rol,
        telefono: usuario.telefono,
        direccion: usuario.direccion,
      },
      sellerStatus,
    });

  } catch (error) {
    console.error("Error en login:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// ────────────────────────────────────────────────────────────
// Cambiar contraseña (tipado correcto)
// ────────────────────────────────────────────────────────────
export const changePassword: RequestHandler = async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ message: "Usuario no autenticado" });
      return;
    }

    const { passwordActual, passwordNueva } = req.body;

    if (!passwordActual || !passwordNueva) {
      res.status(400).json({ message: "Debes completar ambos campos" });
      return;
    }

    if (passwordNueva.length < 8) {
      res.status(400).json({
        message: "La nueva contraseña debe tener mínimo 8 caracteres",
      });
      return;
    }

    const user = await User.findByPk(userId);

    if (!user) {
      res.status(404).json({ message: "Usuario no encontrado" });
      return;
    }

    const passwordValida = await bcrypt.compare(
      passwordActual,
      user.password
    );

    if (!passwordValida) {
      res.status(400).json({
        message: "La contraseña actual es incorrecta",
      });
      return;
    }

    const nuevaPasswordHash = await bcrypt.hash(passwordNueva, 12);

    user.password = nuevaPasswordHash;
    user.token_version += 1;
    await user.save();

    res.status(200).json({
      message: "Contraseña actualizada correctamente",
    });
  } catch (error) {
    console.error("❌ Error al cambiar contraseña:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// ─────────────────────────────────────────────
// Logout global (invalidate all tokens)
// ─────────────────────────────────────────────
export const logoutAll: RequestHandler = async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ message: "Usuario no autenticado" });
      return;
    }

    const user = await User.findByPk(userId);

    if (!user) {
      res.status(404).json({ message: "Usuario no encontrado" });
      return;
    }

    user.token_version += 1;
    await user.save();

    res.status(200).json({
      message: "Sesión cerrada en todos los dispositivos",
    });
  } catch (error) {
    console.error("❌ Error en logoutAll:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// ─────────────────────────────────────────────
// Forgot Password
// ─────────────────────────────────────────────
export const forgotPassword: RequestHandler = async (req, res) => {
  try {
    const { correo } = req.body;

    if (!correo) {
      res.status(400).json({ message: "Correo es obligatorio" });
      return;
    }

    const user = await User.findOne({ where: { correo } });

    // Siempre responder 200 para no revelar existencia
    if (!user) {
      res.status(200).json({
        message: "Si el correo existe, recibirás instrucciones.",
      });
      return;
    }

    const rawToken = crypto.randomBytes(32).toString("hex");

    const hashedToken = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");

    user.reset_password_token = hashedToken;
    user.reset_password_expires = new Date(Date.now() + 15 * 60 * 1000);
    await user.save();

    // 🔥 Enviar email real
    await sendResetPasswordEmail(
      user.correo,
      rawToken,
      user.nombre
    );

    res.status(200).json({
      message: "Si el correo existe, recibirás instrucciones.",
    });

  } catch (error) {
    console.error("❌ Error en forgotPassword:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// ─────────────────────────────────────────────
// Reset Password
// ─────────────────────────────────────────────
export const resetPassword: RequestHandler = async (req, res) => {
  try {
    const { token, passwordNueva } = req.body;

    if (!token || !passwordNueva) {
      res.status(400).json({ message: "Token y nueva contraseña requeridos" });
      return;
    }

    if (passwordNueva.length < 8) {
      res.status(400).json({
        message: "La nueva contraseña debe tener mínimo 8 caracteres",
      });
      return;
    }

    const hashedToken = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const user = await User.findOne({
      where: {
        reset_password_token: hashedToken,
      },
    });

    if (!user) {
      res.status(400).json({ message: "Token inválido" });
      return;
    }

    if (!user.reset_password_expires || user.reset_password_expires < new Date()) {
      res.status(400).json({ message: "Token expirado" });
      return;
    }

    const nuevaPasswordHash = await bcrypt.hash(passwordNueva, 12);

    user.password = nuevaPasswordHash;
    user.token_version += 1;

    // Limpiar campos
    user.reset_password_token = null;
    user.reset_password_expires = null;

    await user.save();

    res.status(200).json({
      message: "Contraseña restablecida correctamente",
    });

  } catch (error) {
    console.error("❌ Error en resetPassword:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};
