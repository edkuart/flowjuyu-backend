"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateSellerBusiness = exports.updateSellerProfile = exports.getSellerProfile = exports.getSellerProducts = exports.getSellerOrders = exports.getSellerDashboard = void 0;
const getSellerDashboard = (req, res) => {
    res.json({
        message: "Bienvenido al panel del vendedor",
        user: req.user,
    });
};
exports.getSellerDashboard = getSellerDashboard;
const getSellerOrders = (_req, res) => {
    res.json({ message: "Pedidos del vendedor" });
};
exports.getSellerOrders = getSellerOrders;
const getSellerProducts = (_req, res) => {
    res.json({ message: "Productos del vendedor" });
};
exports.getSellerProducts = getSellerProducts;
const getSellerProfile = (req, res) => {
    res.json({ message: "Perfil del vendedor", user: req.user });
};
exports.getSellerProfile = getSellerProfile;
const updateSellerProfile = (req, res) => {
    res.json({ message: "Perfil actualizado correctamente" });
};
exports.updateSellerProfile = updateSellerProfile;
const validateSellerBusiness = (_req, res) => {
    res.json({ message: "Documentos enviados para validación del comercio" });
};
exports.validateSellerBusiness = validateSellerBusiness;
