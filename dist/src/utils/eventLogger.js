"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logEvent = void 0;
const db_1 = require("../config/db");
const logEvent = async ({ type, user_id = null, product_id = null, seller_id = null, metadata = null, }) => {
    try {
        await db_1.sequelize.query(`
      INSERT INTO events (type, user_id, product_id, seller_id, metadata)
      VALUES (:type, :user_id, :product_id, :seller_id, :metadata)
      `, {
            replacements: {
                type,
                user_id,
                product_id,
                seller_id,
                metadata: metadata ? JSON.stringify(metadata) : null,
            },
        });
    }
    catch (e) {
        console.error("Event log failed:", e);
    }
};
exports.logEvent = logEvent;
