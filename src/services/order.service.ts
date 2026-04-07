// src/services/order.service.ts
//
// CRITICAL INVARIANTS:
//   - NEVER trust any price, total, or currency from the frontend.
//   - Prices are ALWAYS loaded from the database.
//   - Totals are ALWAYS computed server-side.
//   - Product snapshots are stored at purchase time and never updated.

import { sequelize } from "../config/db";
import Product from "../models/product.model";
import Order from "../models/Order.model";
import OrderItem from "../models/OrderItem.model";
import { ORDER_LIMITS } from "../config/paymentPolicies";

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────
export interface CartItemInput {
  product_id: string;
  quantity: number;
}

export interface OrderDraft {
  seller_id:       number;
  currency:        string;
  subtotal_amount: number;
  fee_amount:      number;
  total_amount:    number;
  items: Array<{
    product_id:            string;
    product_name_snapshot: string;
    unit_price_snapshot:   number;
    quantity:              number;
    line_total:            number;
  }>;
}

interface NormalizedCartItemInput {
  product_id: string;
  quantity: number;
}

export class OrderValidationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "OrderValidationError";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// buildOrderDraft
//
// Validates cart items against DB and computes backend-authoritative amounts.
// Does NOT write to the database.
// ─────────────────────────────────────────────────────────────────────────────
export async function buildOrderDraft(
  items: CartItemInput[],
  currency: string,
): Promise<OrderDraft> {
  if (!items || items.length === 0) {
    throw new OrderValidationError("El carrito está vacío", "CART_EMPTY");
  }

  if (items.length > ORDER_LIMITS.MAX_ITEMS_PER_ORDER) {
    throw new OrderValidationError(
      `El carrito no puede tener más de ${ORDER_LIMITS.MAX_ITEMS_PER_ORDER} productos`,
      "CART_TOO_LARGE",
    );
  }

  // Validate quantity per item
  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      throw new OrderValidationError(
        `Cantidad inválida para el producto ${item.product_id}`,
        "INVALID_QUANTITY",
      );
    }
    if (item.quantity > ORDER_LIMITS.MAX_QUANTITY_PER_ITEM) {
      throw new OrderValidationError(
        `La cantidad máxima por producto es ${ORDER_LIMITS.MAX_QUANTITY_PER_ITEM}`,
        "QUANTITY_EXCEEDS_LIMIT",
      );
    }
  }

  const normalizedItems = normalizeCartItems(items);

  // Load all products from DB in a single query
  const productIds = normalizedItems.map(i => i.product_id);
  const products = await Product.findAll({
    where: { id: productIds },
  });

  if (products.length !== productIds.length) {
    const foundIds = new Set(products.map(p => p.id));
    const missing  = productIds.find(id => !foundIds.has(id));
    throw new OrderValidationError(
      `Producto no encontrado: ${missing}`,
      "PRODUCT_NOT_FOUND",
    );
  }

  // All products must belong to the same seller (orders are per-seller)
  const sellerIds = [...new Set(products.map(p => p.vendedor_id))];
  if (sellerIds.length > 1) {
    throw new OrderValidationError(
      "Todos los productos deben pertenecer al mismo vendedor",
      "MULTI_SELLER_NOT_ALLOWED",
    );
  }
  const seller_id = sellerIds[0];

  if (seller_id === undefined) {
    throw new OrderValidationError(
      "No se pudo determinar el vendedor del pedido",
      "SELLER_NOT_FOUND",
    );
  }

  const productMap = new Map(products.map(p => [p.id, p]));
  const draftItems: OrderDraft["items"] = [];
  let subtotal = 0;

  for (const item of normalizedItems) {
    const product = productMap.get(item.product_id)!;

    if (!product.activo) {
      throw new OrderValidationError(
        `El producto "${product.nombre}" no está disponible`,
        "PRODUCT_INACTIVE",
      );
    }

    if (product.stock < item.quantity) {
      throw new OrderValidationError(
        `Stock insuficiente para "${product.nombre}". Disponible: ${product.stock}`,
        "INSUFFICIENT_STOCK",
      );
    }

    // Price comes from DB — never from the frontend request
    const unitPrice = Number(product.precio);
    const lineTotal = Number((unitPrice * item.quantity).toFixed(2));
    subtotal       += lineTotal;

    draftItems.push({
      product_id:            product.id,
      product_name_snapshot: product.nombre,
      unit_price_snapshot:   unitPrice,
      quantity:              item.quantity,
      line_total:            lineTotal,
    });
  }

  subtotal = Number(subtotal.toFixed(2));

  if (subtotal < ORDER_LIMITS.MIN_AMOUNT_PER_ORDER) {
    throw new OrderValidationError(
      `El monto mínimo por pedido es ${ORDER_LIMITS.MIN_AMOUNT_PER_ORDER} ${currency}`,
      "AMOUNT_TOO_LOW",
    );
  }

  if (subtotal > ORDER_LIMITS.MAX_AMOUNT_PER_ORDER) {
    throw new OrderValidationError(
      `El monto máximo por pedido es ${ORDER_LIMITS.MAX_AMOUNT_PER_ORDER} ${currency}`,
      "AMOUNT_TOO_HIGH",
    );
  }

  const fee_amount  = Number((subtotal * ORDER_LIMITS.FEE_RATE).toFixed(2));
  const total_amount = Number((subtotal + fee_amount).toFixed(2));

  return {
    seller_id,
    currency,
    subtotal_amount: subtotal,
    fee_amount,
    total_amount,
    items: draftItems,
  };
}

function normalizeCartItems(items: CartItemInput[]): NormalizedCartItemInput[] {
  const grouped = new Map<string, number>();

  for (const item of items) {
    grouped.set(
      item.product_id,
      (grouped.get(item.product_id) ?? 0) + item.quantity,
    );
  }

  return [...grouped.entries()].map(([product_id, quantity]) => ({
    product_id,
    quantity,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// createOrderFromCart
//
// Validates items, computes backend-authoritative amounts, persists the order
// and all order_items atomically.
// ─────────────────────────────────────────────────────────────────────────────
export async function createOrderFromCart(
  buyerId:     number,
  items:       CartItemInput[],
  currency:    string,
  riskLevel?:  string,
  orderStatus: "pending_payment" | "manual_review" = "pending_payment",
): Promise<Order> {
  const draft = await buildOrderDraft(items, currency);

  return sequelize.transaction(async (t) => {
    const order = await Order.create(
      {
        buyer_id:        buyerId,
        seller_id:       draft.seller_id,
        status:          orderStatus,
        currency:        draft.currency,
        subtotal_amount: draft.subtotal_amount,
        fee_amount:      draft.fee_amount,
        total_amount:    draft.total_amount,
        risk_level:      riskLevel ?? null,
        review_status:   orderStatus === "manual_review" ? "pending" : null,
      },
      { transaction: t },
    );

    await OrderItem.bulkCreate(
      draft.items.map(item => ({
        order_id:              order.id,
        product_id:            item.product_id,
        product_name_snapshot: item.product_name_snapshot,
        unit_price_snapshot:   item.unit_price_snapshot,
        quantity:              item.quantity,
        line_total:            item.line_total,
        metadata:              null,
      })),
      { transaction: t },
    );

    return order;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// recalculateOrderTotals
//
// Reloads order items from DB and recomputes subtotal, fee, and total.
// Updates the order record. Used by admin flows that modify items.
// ─────────────────────────────────────────────────────────────────────────────
export async function recalculateOrderTotals(orderId: number): Promise<{
  subtotal_amount: number;
  fee_amount:      number;
  total_amount:    number;
}> {
  const items = await OrderItem.findAll({ where: { order_id: orderId } });

  const subtotal    = Number(
    items.reduce((sum, i) => sum + Number(i.line_total), 0).toFixed(2),
  );
  const fee_amount  = Number((subtotal * ORDER_LIMITS.FEE_RATE).toFixed(2));
  const total_amount = Number((subtotal + fee_amount).toFixed(2));

  await Order.update(
    { subtotal_amount: subtotal, fee_amount, total_amount },
    { where: { id: orderId } },
  );

  return { subtotal_amount: subtotal, fee_amount, total_amount };
}
