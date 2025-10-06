"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.models = exports.VendedorPerfil = exports.User = exports.sequelize = void 0;
// src/models/index.ts
const db_1 = require("../config/db");
Object.defineProperty(exports, "sequelize", { enumerable: true, get: function () { return db_1.sequelize; } });
const user_model_1 = require("./user.model");
Object.defineProperty(exports, "User", { enumerable: true, get: function () { return user_model_1.User; } });
const VendedorPerfil_1 = require("./VendedorPerfil");
Object.defineProperty(exports, "VendedorPerfil", { enumerable: true, get: function () { return VendedorPerfil_1.VendedorPerfil; } });
// Asociaciones centralizadas
user_model_1.User.hasOne(VendedorPerfil_1.VendedorPerfil, {
    foreignKey: "user_id",
    as: "perfil",
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
});
VendedorPerfil_1.VendedorPerfil.belongsTo(user_model_1.User, {
    foreignKey: "user_id",
    as: "user",
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
});
// Exportar colección para recorridos (tests, migraciones, etc.)
exports.models = { User: user_model_1.User, VendedorPerfil: VendedorPerfil_1.VendedorPerfil };
