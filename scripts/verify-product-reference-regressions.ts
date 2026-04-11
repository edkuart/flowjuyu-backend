import assert from "node:assert/strict";
import ConversationSession from "../src/models/ConversationSession.model";
import { sequelize } from "../src/config/db";
import { matchConversationCommand } from "../src/services/conversations/conversationCommandMatcher.service";
import { routeConversationCommand } from "../src/services/conversations/conversationCommandRouter.service";

type MutableSession = InstanceType<typeof ConversationSession>;

type ProductRow = {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio: string;
  stock: number;
  categoria_id: number | null;
  categoria_custom: string | null;
  categoria_nombre: string | null;
  clase_id: number | null;
  clase_nombre: string | null;
  activo: boolean;
  imagen_url: string | null;
};

const SELLER_SKU = "SKU_DEMO-99";
const INTERNAL_CODE = "FJ-BAJ-COR-260326-G4AZ4Z";

function buildSession(overrides?: Record<string, unknown>): MutableSession {
  return ConversationSession.build(
    {
      id: "session-product-ref-1",
      phone_e164: "+50255555555",
      channel: "whatsapp",
      linked_seller_user_id: 77,
      current_step: "awaiting_confirmation",
      expected_input_type: "text",
      pending_confirmation_json: null,
      command_context_json: {
        lastShownProducts: [
          { index: 1, productId: "prod-context-1", nombre: "Producto contexto", activo: false },
        ],
        lastShownAt: new Date().toISOString(),
      },
      status: "active",
      ...overrides,
    } as any
  ) as MutableSession;
}

function buildProductRow(overrides?: Partial<ProductRow>): ProductRow {
  return {
    id: "prod-1",
    nombre: "Bolsa tejida",
    descripcion: "Hecha a mano",
    precio: "250.00",
    stock: 3,
    categoria_id: 2,
    categoria_custom: null,
    categoria_nombre: "Bolsas",
    clase_id: 3,
    clase_nombre: "Textil",
    activo: false,
    imagen_url: null,
    ...overrides,
  };
}

function withSequelizeQueryMock() {
  const originalQuery = sequelize.query.bind(sequelize);

  (sequelize as any).query = async (sql: string, options?: { replacements?: Record<string, unknown> }) => {
    const replacements = options?.replacements ?? {};
    const sellerUserId = replacements.sellerUserId ?? replacements.vendedor_id ?? replacements.vid;
    const value = String(replacements.value ?? "");
    const productId = String(replacements.productId ?? "");

    if (sql.includes("UPPER(p.seller_sku) = UPPER(:value)")) {
      if (sellerUserId === 77 && value.toUpperCase() === SELLER_SKU) {
        return [buildProductRow({ id: "prod-seller-sku", nombre: "Producto SKU" })];
      }
      return [];
    }

    if (sql.includes("UPPER(p.internal_code) = UPPER(:value)")) {
      if (sellerUserId === 77 && value.toUpperCase() === INTERNAL_CODE) {
        return [buildProductRow({ id: "prod-internal-code", nombre: "Producto código" })];
      }
      return [];
    }

    if (sql.includes("WHERE p.id = :productId")) {
      if (sellerUserId === 77 && productId === "prod-context-1") {
        return [buildProductRow({ id: "prod-context-1", nombre: "Producto contexto" })];
      }
      return [];
    }

    return originalQuery(sql as any, options as any);
  };

  return {
    restore() {
      (sequelize as any).query = originalQuery;
    },
  };
}

async function testReferenceFoundBySellerSku() {
  const result = await routeConversationCommand({
    session: buildSession(),
    seller: { user_id: 77 } as any,
    message: { type: "text", text: `sku ${SELLER_SKU.toLowerCase()}` } as any,
  });

  assert.equal(result.handled, true);
  assert.equal(result.commandKey, "mis_productos");
  assert.match(result.responseText ?? "", /Producto SKU/);
  assert.equal(result.nextCommandContext?.selectedProductId, "prod-seller-sku");
}

async function testReferenceFoundByInternalCode() {
  const result = await routeConversationCommand({
    session: buildSession(),
    seller: { user_id: 77 } as any,
    message: { type: "text", text: INTERNAL_CODE.toLowerCase() } as any,
  });

  assert.equal(result.handled, true);
  assert.equal(result.commandKey, "mis_productos");
  assert.match(result.responseText ?? "", /Producto código/);
  assert.equal(result.nextCommandContext?.selectedProductId, "prod-internal-code");
}

async function testReferenceNotFound() {
  const result = await routeConversationCommand({
    session: buildSession(),
    seller: { user_id: 77 } as any,
    message: { type: "text", text: "sku NO_EXISTE-999" } as any,
  });

  assert.equal(result.handled, true);
  assert.equal(
    result.responseText,
    "No encontré un producto con esa referencia. Revisa el código e intenta de nuevo."
  );
}

async function testReferenceFromOtherSeller() {
  const result = await routeConversationCommand({
    session: buildSession(),
    seller: { user_id: 88 } as any,
    message: { type: "text", text: INTERNAL_CODE } as any,
  });

  assert.equal(result.handled, true);
  assert.equal(
    result.responseText,
    "No encontré un producto con esa referencia. Revisa el código e intenta de nuevo."
  );
}

async function testVerIndexStillUsesContext() {
  const match = matchConversationCommand("ver 1");
  assert.equal(match.commandKey, "ver_producto");
  assert.equal(match.skuArg, undefined);

  const result = await routeConversationCommand({
    session: buildSession(),
    seller: { user_id: 77 } as any,
    message: { type: "text", text: "ver 1" } as any,
  });

  assert.equal(result.handled, true);
  assert.equal(result.commandKey, "ver_producto");
  assert.match(result.responseText ?? "", /Producto contexto/);
}

async function main() {
  const queryMock = withSequelizeQueryMock();

  try {
    await testReferenceFoundBySellerSku();
    await testReferenceFoundByInternalCode();
    await testReferenceNotFound();
    await testReferenceFromOtherSeller();
    await testVerIndexStillUsesContext();
    console.log("[product-reference-regression] ok");
  } finally {
    queryMock.restore();
  }
}

main();
