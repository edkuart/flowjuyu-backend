"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createWarrantyClaim = exports.getWarranties = exports.deleteCard = exports.addCard = exports.getCards = exports.updateNotificationSettings = exports.getNotifications = exports.deleteReview = exports.createReview = exports.getReviews = exports.removeFavorite = exports.addFavorite = exports.getFavorites = exports.deleteAddress = exports.updateAddress = exports.getAddresses = exports.createAddress = exports.updateBuyerProfile = exports.getBuyerProfile = exports.getBuyerOrders = exports.getBuyerDashboard = void 0;
const Address_model_1 = __importDefault(require("../models/Address.model"));
const getBuyerDashboard = (req, res) => {
    res.json({
        message: "Bienvenido al panel del comprador",
        user: req.user,
    });
};
exports.getBuyerDashboard = getBuyerDashboard;
const getBuyerOrders = (req, res) => {
    res.json({ message: "Órdenes del comprador" });
};
exports.getBuyerOrders = getBuyerOrders;
const getBuyerProfile = (req, res) => {
    res.json({ message: "Perfil del comprador", user: req.user });
};
exports.getBuyerProfile = getBuyerProfile;
const updateBuyerProfile = (req, res) => {
    res.json({ message: "Perfil actualizado" });
};
exports.updateBuyerProfile = updateBuyerProfile;
const createAddress = async (req, res) => {
    try {
        const user = req.user;
        const nueva = await Address_model_1.default.create({
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
    }
    catch (error) {
        console.error("Error creando dirección:", error);
        res.status(500).json({ message: "Error del servidor" });
    }
};
exports.createAddress = createAddress;
const getAddresses = async (req, res) => {
    const user = req.user;
    const direcciones = await Address_model_1.default.findAll({
        where: { user_id: user.id },
    });
    res.json(direcciones);
};
exports.getAddresses = getAddresses;
const updateAddress = async (req, res) => {
    try {
        const user = req.user;
        const id = req.params.id;
        const address = await Address_model_1.default.findOne({
            where: { id, user_id: user.id },
        });
        if (!address) {
            res.status(404).json({ message: "Dirección no encontrada" });
            return;
        }
        const { nombre_receptor, apellido_receptor, telefono, departamento, municipio, direccion_exacta, referencia, } = req.body;
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
    }
    catch (error) {
        console.error("Error actualizando dirección:", error);
        res.status(500).json({ message: "Error del servidor" });
    }
};
exports.updateAddress = updateAddress;
const deleteAddress = async (req, res) => {
    const user = req.user;
    const id = req.params.id;
    const deleted = await Address_model_1.default.destroy({
        where: {
            id,
            user_id: user.id,
        },
    });
    res.json({ message: "Dirección eliminada", deleted });
};
exports.deleteAddress = deleteAddress;
const getFavorites = (req, res) => {
    res.json({ message: "Favoritos del comprador" });
};
exports.getFavorites = getFavorites;
const addFavorite = (req, res) => {
    res.json({ message: "Favorito agregado" });
};
exports.addFavorite = addFavorite;
const removeFavorite = (req, res) => {
    res.json({ message: "Favorito eliminado" });
};
exports.removeFavorite = removeFavorite;
const getReviews = (req, res) => {
    res.json({ message: "Opiniones del comprador" });
};
exports.getReviews = getReviews;
const createReview = (req, res) => {
    res.json({ message: "Opinión creada" });
};
exports.createReview = createReview;
const deleteReview = (req, res) => {
    res.json({ message: "Opinión eliminada" });
};
exports.deleteReview = deleteReview;
const getNotifications = (req, res) => {
    res.json({ message: "Lista de notificaciones" });
};
exports.getNotifications = getNotifications;
const updateNotificationSettings = (req, res) => {
    res.json({ message: "Configuración actualizada" });
};
exports.updateNotificationSettings = updateNotificationSettings;
const getCards = (req, res) => {
    res.json({ message: "Tarjetas guardadas" });
};
exports.getCards = getCards;
const addCard = (req, res) => {
    res.json({ message: "Tarjeta agregada" });
};
exports.addCard = addCard;
const deleteCard = (req, res) => {
    res.json({ message: "Tarjeta eliminada" });
};
exports.deleteCard = deleteCard;
const getWarranties = (req, res) => {
    res.json({ message: "Garantías en proceso" });
};
exports.getWarranties = getWarranties;
const createWarrantyClaim = (req, res) => {
    res.json({ message: "Reclamo creado" });
};
exports.createWarrantyClaim = createWarrantyClaim;
