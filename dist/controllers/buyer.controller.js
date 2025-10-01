"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateBuyerProfile = exports.getBuyerProfile = exports.getBuyerOrders = exports.getBuyerDashboard = void 0;
const getBuyerDashboard = (req, res) => {
    res.json({
        message: "Bienvenido al panel del comprador",
        user: req.user,
    });
};
exports.getBuyerDashboard = getBuyerDashboard;
const getBuyerOrders = (_req, res) => {
    res.json({ message: "Órdenes del comprador" });
};
exports.getBuyerOrders = getBuyerOrders;
const getBuyerProfile = (req, res) => {
    res.json({ message: "Perfil del comprador", user: req.user });
};
exports.getBuyerProfile = getBuyerProfile;
const updateBuyerProfile = (req, res) => {
    res.json({ message: "Perfil del comprador actualizado" });
};
exports.updateBuyerProfile = updateBuyerProfile;
