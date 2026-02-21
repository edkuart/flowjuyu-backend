"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetPassword = exports.forgotPassword = exports.logoutAll = exports.changePassword = exports.login = exports.registerVendedor = exports.register = void 0;
const bcrypt_1 = __importDefault(require("bcrypt"));
const crypto_1 = __importDefault(require("crypto"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const db_1 = require("../config/db");
const user_model_1 = require("../models/user.model");
const VendedorPerfil_1 = require("../models/VendedorPerfil");
const email_service_1 = require("../services/email.service");
const generateToken = (payload) => jsonwebtoken_1.default.sign(payload, process.env.JWT_SECRET || "cortes_secret", {
    expiresIn: "1d",
});
const register = async (req, res) => {
    try {
        const { nombre, correo, rol, telefono, direccion } = req.body;
        const plain = req.body["contraseña"] ??
            req.body["contrasena"] ??
            req.body["password"];
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
        const hash = await bcrypt_1.default.hash(String(password), 10);
        const nuevoUsuario = await user_model_1.User.create({
            nombre,
            correo,
            password: hash,
            rol: "seller",
            telefono: (telefono ?? "").toString().trim(),
            direccion: (direccion ?? "").toString().trim(),
        }, { transaction: t });
        const files = req.files || {};
        await VendedorPerfil_1.VendedorPerfil.create({
            user_id: nuevoUsuario.id,
            nombre: nombre.trim(),
            email: correo.toLowerCase().trim(),
            telefono: telefono ? telefono.trim() : null,
            direccion: direccion ? direccion.trim() : null,
            logo: files["logo"]
                ? `/uploads/vendedores/${files["logo"][0].filename}`
                : null,
            nombre_comercio: nombreComercio.trim(),
            telefono_comercio: telefonoComercio
                ? telefonoComercio.trim()
                : null,
            departamento: departamento ?? null,
            municipio: municipio ?? null,
            descripcion: descripcion ?? null,
            dpi: dpi.trim(),
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
        }, { transaction: t });
        await t.commit();
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
    }
    catch (error) {
        await t.rollback();
        console.error("Error en registerVendedor:", error);
        res.status(500).json({ message: "Error al registrar vendedor" });
    }
};
exports.registerVendedor = registerVendedor;
const login = async (req, res) => {
    try {
        const { correo } = req.body;
        const plain = req.body["contraseña"] ??
            req.body["contrasena"] ??
            req.body["password"];
        if (!correo || !plain) {
            res.status(400).json({
                message: "Correo y contraseña son obligatorios",
            });
            return;
        }
        const usuario = await user_model_1.User.findOne({ where: { correo } });
        if (!usuario) {
            res.status(401).json({
                message: "Correo o contraseña incorrectos",
            });
            return;
        }
        const passwordValida = await bcrypt_1.default.compare(String(plain), usuario.password);
        if (!passwordValida) {
            res.status(401).json({
                message: "Correo o contraseña incorrectos",
            });
            return;
        }
        let sellerStatus = null;
        if (usuario.rol === "seller") {
            const perfil = await VendedorPerfil_1.VendedorPerfil.findOne({
                where: { user_id: usuario.id },
            });
            if (perfil) {
                if (perfil.estado_admin === "suspendido") {
                    res.status(403).json({
                        message: "Cuenta suspendida por administración",
                    });
                    return;
                }
                if (perfil.estado_validacion === "rechazado") {
                    res.status(403).json({
                        message: "Tu solicitud fue rechazada. Contacta soporte.",
                    });
                    return;
                }
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
    }
    catch (error) {
        console.error("Error en login:", error);
        res.status(500).json({ message: "Error interno del servidor" });
    }
};
exports.login = login;
const changePassword = async (req, res) => {
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
        const user = await user_model_1.User.findByPk(userId);
        if (!user) {
            res.status(404).json({ message: "Usuario no encontrado" });
            return;
        }
        const passwordValida = await bcrypt_1.default.compare(passwordActual, user.password);
        if (!passwordValida) {
            res.status(400).json({
                message: "La contraseña actual es incorrecta",
            });
            return;
        }
        const nuevaPasswordHash = await bcrypt_1.default.hash(passwordNueva, 12);
        user.password = nuevaPasswordHash;
        user.token_version += 1;
        await user.save();
        res.status(200).json({
            message: "Contraseña actualizada correctamente",
        });
    }
    catch (error) {
        console.error("❌ Error al cambiar contraseña:", error);
        res.status(500).json({ message: "Error interno del servidor" });
    }
};
exports.changePassword = changePassword;
const logoutAll = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ message: "Usuario no autenticado" });
            return;
        }
        const user = await user_model_1.User.findByPk(userId);
        if (!user) {
            res.status(404).json({ message: "Usuario no encontrado" });
            return;
        }
        user.token_version += 1;
        await user.save();
        res.status(200).json({
            message: "Sesión cerrada en todos los dispositivos",
        });
    }
    catch (error) {
        console.error("❌ Error en logoutAll:", error);
        res.status(500).json({ message: "Error interno del servidor" });
    }
};
exports.logoutAll = logoutAll;
const forgotPassword = async (req, res) => {
    try {
        const { correo } = req.body;
        if (!correo) {
            res.status(400).json({ message: "Correo es obligatorio" });
            return;
        }
        const user = await user_model_1.User.findOne({ where: { correo } });
        if (!user) {
            res.status(200).json({
                message: "Si el correo existe, recibirás instrucciones.",
            });
            return;
        }
        const rawToken = crypto_1.default.randomBytes(32).toString("hex");
        const hashedToken = crypto_1.default
            .createHash("sha256")
            .update(rawToken)
            .digest("hex");
        user.reset_password_token = hashedToken;
        user.reset_password_expires = new Date(Date.now() + 15 * 60 * 1000);
        await user.save();
        await (0, email_service_1.sendResetPasswordEmail)(user.correo, rawToken, user.nombre);
        res.status(200).json({
            message: "Si el correo existe, recibirás instrucciones.",
        });
    }
    catch (error) {
        console.error("❌ Error en forgotPassword:", error);
        res.status(500).json({ message: "Error interno del servidor" });
    }
};
exports.forgotPassword = forgotPassword;
const resetPassword = async (req, res) => {
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
        const hashedToken = crypto_1.default
            .createHash("sha256")
            .update(token)
            .digest("hex");
        const user = await user_model_1.User.findOne({
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
        const nuevaPasswordHash = await bcrypt_1.default.hash(passwordNueva, 12);
        user.password = nuevaPasswordHash;
        user.token_version += 1;
        user.reset_password_token = null;
        user.reset_password_expires = null;
        await user.save();
        res.status(200).json({
            message: "Contraseña restablecida correctamente",
        });
    }
    catch (error) {
        console.error("❌ Error en resetPassword:", error);
        res.status(500).json({ message: "Error interno del servidor" });
    }
};
exports.resetPassword = resetPassword;
