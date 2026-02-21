"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logAdminEvent = logAdminEvent;
const adminAuditEvent_model_1 = __importDefault(require("../models/adminAuditEvent.model"));
async function logAdminEvent({ entityType, entityId, action, performedBy, comment, metadata, }) {
    await adminAuditEvent_model_1.default.create({
        entity_type: entityType,
        entity_id: entityId,
        action,
        performed_by: performedBy,
        comment: comment || null,
        metadata: metadata || null,
    });
}
