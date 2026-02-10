// src/controllers/auth.controller.ts

import { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { sequelize } from "../config/db";
import { User } from "../models/user.model";
import { VendedorPerfil } from "../models/VendedorPerfil";

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
export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { nombre, correo, rol, telefono, direccion } = req.body;

    const plain =
      req.body["contraseña"] ?? req.body["contrasena"] ?? req.body["password"];

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
  } catch (error: any) {
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

export const registerVendedor = async (req: Request, res: Response): Promise<void> => {
  const t = await sequelize.transaction();
  try {
    console.log("🧩 req.body recibido:", req.body);

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

    // Crear usuario base
    const hash = await bcrypt.hash(String(password), 10);
    const nuevoUsuario = await User.create(
      {
        nombre,
        correo,
        password: hash,
        rol: "vendedor",
        telefono: (telefono ?? "").toString().trim(),
        direccion: (direccion ?? "").toString().trim(),
      },
      { transaction: t },
    );

    const files = (req.files as MulterFilesMap | undefined) || {};

    // Crear perfil del vendedor
    const perfilPayload = {
      user_id: nuevoUsuario.id,
      nombre: String(nombre).trim(),
    
      // ✅ FIX DEFINITIVO
      email: String(correo).toLowerCase().trim(),
    
      telefono: telefono ? String(telefono).trim() : null,
      direccion: direccion ? String(direccion).trim() : null,
    
      logo: files["logo"]
        ? `/uploads/vendedores/${files["logo"]![0].filename}`
        : null,
    
      nombre_comercio: String(nombreComercio).trim(),
      telefono_comercio: telefonoComercio ? String(telefonoComercio).trim() : null,
      departamento: departamento ? String(departamento).trim() : null,
      municipio: municipio ? String(municipio).trim() : null,
      descripcion: descripcion ? String(descripcion).trim() : null,
      dpi: dpi ? String(dpi).trim() : null,
    
      foto_dpi_frente: files["fotoDPIFrente"]
        ? `/uploads/vendedores/${files["fotoDPIFrente"]![0].filename}`
        : null,
    
      foto_dpi_reverso: files["fotoDPIReverso"]
        ? `/uploads/vendedores/${files["fotoDPIReverso"]![0].filename}`
        : null,
    
      selfie_con_dpi: files["selfieConDPI"]
        ? `/uploads/vendedores/${files["selfieConDPI"]![0].filename}`
        : null,
    
      estado_validacion: "pendiente",
      estado: "activo",
      observaciones: null,
      actualizado_en: new Date(),
    };    

  await VendedorPerfil.create(perfilPayload as any, { transaction: t });
    await t.commit();

    const token = generateToken({
      id: nuevoUsuario.id,
      correo: nuevoUsuario.correo,
      rol: nuevoUsuario.rol,
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
  } catch (error: any) {
    await t.rollback();
    console.error("Error en registerVendedor:", error);
    res.status(500).json({ message: "Error al registrar vendedor" });
  }
};

// ────────────────────────────────────────────────────────────
// Login con JWT
// ────────────────────────────────────────────────────────────
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { correo } = req.body;
    const plain =
      req.body["contraseña"] ?? req.body["contraseña"] ?? req.body["password"];

    if (!correo || !plain) {
      res.status(400).json({ message: "Correo y contraseña son obligatorios" });
      return;
    }

    const usuario = await User.findOne({ where: { correo } });
    if (!usuario) {
      res.status(401).json({ message: "Correo o contraseña incorrectos" });
      return;
    }

    const contraseñaValida = await bcrypt.compare(String(plain), usuario.password);
    if (!contraseñaValida) {
      res.status(401).json({ message: "Correo o contraseña incorrectos" });
      return;
    }

    const token = generateToken({
      id: usuario.id,
      correo: usuario.correo,
      rol: usuario.rol,
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
    });
  } catch (error: any) {
    console.error("Error en login:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
  console.log("🧩 req.body recibido:", req.body);

};