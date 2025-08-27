
import { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { User } from "../models/user.model";
import { VendedorPerfil } from "../models/VendedorPerfil";

const generateToken = (payload: object) => {
  return jwt.sign(payload, process.env.JWT_SECRET || "cortes_secret", {
    expiresIn: "1d",
  });
};

// ==========================
// Registro general (comprador)
// ==========================
export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { nombre, correo, contraseña, rol, telefono, direccion } = req.body;

    if (!nombre || !correo || !contraseña || !rol) {
      res.status(400).json({ message: "Faltan campos obligatorios" });
      return;
    }

    const usuarioExistente = await User.findOne({ where: { correo } });
    if (usuarioExistente) {
      res.status(409).json({ message: "El correo ya está registrado" });
      return;
    }

    const hash = await bcrypt.hash(contraseña, 10);

    const nuevoUsuario = await User.create({
      nombre,
      correo,
      contraseña: hash,
      rol,
      telefono: telefono?.trim() || "",
      direccion: direccion?.trim() || "",
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
  } catch (error) {
    console.error("Error en register:", error);
    res.status(500).json({ message: "Error al registrar" });
  }
};

// ==========================
// Registro exclusivo para vendedores
// ==========================
export const registerVendedor = async (req: Request, res: Response): Promise<void> => {
  try {
    // Recibe los nombres como llegan del frontend
    const {
      nombre,
      email,                // <--- frontend manda 'email'
      telefono,             // teléfono personal
      password,             // <--- frontend manda 'password'
      nombreComercio,
      telefonoComercio,
      direccion,
      departamento,
      municipio,
      descripcion,
      dpi,
    } = req.body;

    if (!nombre || !email || !password || !dpi || !nombreComercio) {
      res.status(400).json({ message: "Faltan campos obligatorios" });
      return;
    }

    // Verificar usuario existente (User)
    const usuarioExistente = await User.findOne({ where: { correo: email } });
    if (usuarioExistente) {
      res.status(409).json({ message: "El correo ya está registrado" });
      return;
    }

    // Crear usuario (User)
    const hash = await bcrypt.hash(password, 10);
    const nuevoUsuario = await User.create({
      nombre,
      correo: email,
      contraseña: hash,
      rol: "vendedor",
      telefono: telefono?.trim() || "",
      direccion: direccion?.trim() || "",
    });

    // Archivos
    const files = req.files as { [key: string]: Express.Multer.File[] | undefined };

    // Crear perfil vendedor (VendedorPerfil)
    await VendedorPerfil.create({
      id: nuevoUsuario.id,
      nombre,
      email,
      telefono: telefono?.trim() || "",
      direccion: direccion?.trim() || "",
      imagen_url: files["logo"] ? `/uploads/vendedores/${files["logo"][0].filename}` : null,
      nombre_comercio: nombreComercio,
      telefono_comercio: telefonoComercio,
      departamento,
      municipio,
      descripcion,
      dpi,
      foto_dpi_frente: files["fotoDPIFrente"] ? `/uploads/vendedores/${files["fotoDPIFrente"][0].filename}` : null,
      foto_dpi_reverso: files["fotoDPIReverso"] ? `/uploads/vendedores/${files["fotoDPIReverso"][0].filename}` : null,
      selfie_con_dpi: files["selfieConDPI"] ? `/uploads/vendedores/${files["selfieConDPI"][0].filename}` : null,
    });

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
  } catch (error) {
    console.error("Error en registerVendedor:", error);
    res.status(500).json({ message: "Error al registrar vendedor" });
  }
};

// ==========================
// Login con JWT
// ==========================
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { correo, contraseña } = req.body;

    if (!correo || !contraseña) {
      res.status(400).json({ message: "Correo y contraseña son obligatorios" });
      return;
    }

    const usuario = await User.findOne({ where: { correo } });
    if (!usuario) {
      res.status(401).json({ message: "Correo o contraseña incorrectos" });
      return;
    }

    const contraseñaValida = await bcrypt.compare(contraseña, usuario.contraseña);
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
  } catch (error) {
    console.error("Error en login:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// ==========================
// Login con Google (Firebase Auth)
// ==========================
export const loginWithGoogle = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, nombre } = req.body;
    if (!email) {
      res.status(400).json({ ok: false, message: "El email es obligatorio." });
      return;
    }

    // 1. Buscar usuario existente por email
    let usuario = await User.findOne({ where: { correo: email } });

    // 2. Si NO existe, crearlo como comprador
    if (!usuario) {
      usuario = await User.create({
        nombre: nombre || "Usuario Google",
        correo: email,
        contraseña: "", // Google, sin contraseña
        rol: "comprador",
        telefono: "",
        direccion: "",
      });
    }

    // 3. Generar token
    const token = generateToken({
      id: usuario.id,
      correo: usuario.correo,
      rol: usuario.rol,
    });

    res.status(200).json({
      ok: true,
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
  } catch (error) {
    console.error("Error en loginWithGoogle:", error);
    res.status(500).json({ ok: false, message: "Error en login con Google." });
  }
};

// ==========================
// Logout seguro
// ==========================
export const logout = (req: Request, res: Response): void => {
  if (req.session) {
    req.session.destroy((err) => {
      if (err) {
        res.status(500).json({ message: "Error al cerrar sesión" });
      } else {
        res.clearCookie("connect.sid");
        res.json({ ok: true, message: "Sesión cerrada en el backend" });
      }
    });
  } else {
    res.json({ ok: true, message: "Logout exitoso. El token debe eliminarse en el cliente." });
  }
};

// ==========================
// Validar token (pendiente middleware)
// ==========================
export const getSession = (_req: Request, res: Response): void => {
  res.status(501).json({ message: "Implementar verificación de token en middleware." });
};
