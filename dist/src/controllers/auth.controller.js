"use strict";
// src/controllers/auth.controller.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.login = exports.registerVendedor = exports.register = void 0;
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const db_1 = require("../config/db");
const user_model_1 = require("../models/user.model");
const VendedorPerfil_1 = require("../models/VendedorPerfil");
// ────────────────────────────────────────────────────────────
// Utilidad JWT
// ────────────────────────────────────────────────────────────
const generateToken = (payload) => jsonwebtoken_1.default.sign(payload, process.env.JWT_SECRET || "cortes_secret", {
    expiresIn: "1d",
});
// ────────────────────────────────────────────────────────────
// Registro general (comprador)
// ────────────────────────────────────────────────────────────
const register = async (req, res) => {
    try {
        const { nombre, correo, rol, telefono, direccion } = req.body;
        const plain = req.body["contraseña"] ?? req.body["contrasena"] ?? req.body["password"];
        if (!nombre || !correo || !plain || !rol) {
            res.status(400).json({ message: "Faltan campos obligatorios" });
            return;
        }
        const usuarioExistente = await user_model_1.User.findOne({ where: { correo } });
        if (usuarioExistente) {
            res.status(409).json({ message: "El correo ya está registrado" });
            return;
        }
        const hash = await bcrypt_1.default.hash(String(plain), 10);
        const nuevoUsuario = await user_model_1.User.create({
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
    }
    catch (error) {
        console.error("Error en register:", error);
        res.status(500).json({ message: "Error al registrar" });
    }
};
exports.register = register;
const registerVendedor = async (req, res) => {
    const t = await db_1.sequelize.transaction();
    try {
        console.log("🧩 req.body recibido:", req.body);
        const { nombre, correo, telefono, password, nombreComercio, telefonoComercio, direccion, departamento, municipio, descripcion, dpi, } = req.body;
        if (!nombre || !correo || !password || !dpi || !nombreComercio) {
            res.status(400).json({ message: "Faltan campos obligatorios" });
            return;
        }
        const usuarioExistente = await user_model_1.User.findOne({ where: { correo } });
        if (usuarioExistente) {
            res.status(409).json({ message: "El correo ya está registrado" });
            return;
        }
        // Crear usuario base
        const hash = await bcrypt_1.default.hash(String(password), 10);
        const nuevoUsuario = await user_model_1.User.create({
            nombre,
            correo,
            password: hash,
            rol: "vendedor",
            telefono: (telefono ?? "").toString().trim(),
            direccion: (direccion ?? "").toString().trim(),
        }, { transaction: t });
        const files = req.files || {};
        // Crear perfil del vendedor
        const perfilPayload = {
            user_id: nuevoUsuario.id,
            nombre,
            correo,
            telefono: (telefono ?? "").toString().trim(),
            direccion: (direccion ?? "").toString().trim(),
            logo: files["logo"] ? `/uploads/vendedores/${files["logo"][0].filename}` : null,
            nombre_comercio: nombreComercio,
            telefono_comercio: telefonoComercio,
            departamento,
            municipio,
            descripcion,
            dpi,
            foto_dpi_frente: files["fotoDPIFrente"]
                ? `/uploads/vendedores/${files["fotoDPIFrente"][0].filename}`
                : null,
            foto_dpi_reverso: files["fotoDPIReverso"]
                ? `/uploads/vendedores/${files["fotoDPIReverso"][0].filename}`
                : null,
            selfie_con_dpi: files["selfieConDPI"]
                ? `/uploads/vendedores/${files["selfieConDPI"][0].filename}`
                : null,
            estado_validacion: "pendiente",
            estado: "activo",
            observaciones: null,
            actualizado_en: new Date(),
        };
        await VendedorPerfil_1.VendedorPerfil.create(perfilPayload, { transaction: t });
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
    }
    catch (error) {
        await t.rollback();
        console.error("Error en registerVendedor:", error);
        res.status(500).json({ message: "Error al registrar vendedor" });
    }
};
exports.registerVendedor = registerVendedor;
// ────────────────────────────────────────────────────────────
// Login con JWT
// ────────────────────────────────────────────────────────────
const login = async (req, res) => {
    try {
        const { correo } = req.body;
        const plain = req.body["contraseña"] ?? req.body["contrasena"] ?? req.body["password"];
        if (!correo || !plain) {
            res.status(400).json({ message: "Correo y contraseña son obligatorios" });
            return;
        }
        const usuario = await user_model_1.User.findOne({ where: { correo } });
        if (!usuario) {
            res.status(401).json({ message: "Correo o contraseña incorrectos" });
            return;
        }
        const contraseñaValida = await bcrypt_1.default.compare(String(plain), usuario.password);
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
    }
    catch (error) {
        console.error("Error en login:", error);
        res.status(500).json({ message: "Error interno del servidor" });
    }
};
exports.login = login;
