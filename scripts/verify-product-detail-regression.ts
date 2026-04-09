import assert from "node:assert/strict";
import { buildOwnedProductDetailMessage } from "../src/services/conversations/sellerProductEdit.service";

type RegressionProduct = Parameters<typeof buildOwnedProductDetailMessage>[0];

function buildProduct(overrides: Partial<RegressionProduct>): RegressionProduct {
  return {
    id: "prod-1",
    nombre: "Bolsa tejida",
    descripcion: "Hecha a mano",
    precio: "250",
    stock: 2,
    categoria_id: 2,
    categoria_custom: null,
    categoria_nombre: "Bolsas",
    clase_id: 3,
    clase_nombre: "Accesorios",
    activo: true,
    imagen_url: null,
    ...overrides,
  };
}

function run() {
  const relational = buildOwnedProductDetailMessage(
    buildProduct({})
  );
  assert.match(relational, /Categoría: Bolsas/);
  assert.match(relational, /Clase: Accesorios/);
  assert.doesNotMatch(relational, /Categoría: ID \d+/);
  assert.doesNotMatch(relational, /Clase: ID \d+/);

  const customCategory = buildOwnedProductDetailMessage(
    buildProduct({
      categoria_custom: "  mochila artesanal  ",
      categoria_nombre: "Bolsas",
    })
  );
  assert.match(customCategory, /Categoría: Mochila Artesanal/);
  assert.match(customCategory, /Clase: Accesorios/);

  const missingTaxonomy = buildOwnedProductDetailMessage(
    buildProduct({
      categoria_id: null,
      categoria_custom: null,
      categoria_nombre: null,
      clase_id: null,
      clase_nombre: null,
    })
  );
  assert.match(missingTaxonomy, /Categoría: Sin categoría/);
  assert.match(missingTaxonomy, /Clase: Sin clase/);

  console.log("[product-detail-regression] ok");
}

run();
