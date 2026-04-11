import assert from "node:assert/strict";
import {
  detectIntent,
  isGlobalConversationCommand,
  matchConversationCommand,
  normalizeConversationCommandText,
} from "../src/services/conversations/conversationCommandMatcher.service";

type ExpectedMatch = {
  input: string;
  normalized: string;
};

const creationCommands: ExpectedMatch[] = [
  { input: "Nuevo", normalized: "nuevo" },
  { input: "   nuevo   ", normalized: "nuevo" },
  { input: "crear", normalized: "crear" },
  { input: "CREAR", normalized: "crear" },
  { input: "agregar", normalized: "agregar" },
  { input: "crear producto", normalized: "crear producto" },
  { input: "agregar producto", normalized: "agregar producto" },
  { input: "quiero crear un producto", normalized: "quiero crear un producto" },
  { input: "quiero agregar un producto", normalized: "quiero agregar un producto" },
  { input: "publicar producto", normalized: "publicar producto" },
  { input: "subir producto", normalized: "subir producto" },
];

const nonCreationCommands = [
  "agregar descripcion",
  "agrega que es bonito",
  "agregar que es de algodon",
  "quiero informacion de mis productos",
];

function assertCreationCommand({ input, normalized }: ExpectedMatch) {
  assert.equal(normalizeConversationCommandText(input), normalized);
  assert.equal(detectIntent(input), "nuevo", `Expected intent nuevo for "${input}"`);
  assert.equal(
    isGlobalConversationCommand(input),
    true,
    `Expected global command for "${input}"`
  );

  const match = matchConversationCommand(input);
  assert.equal(match.matched, true, `Expected command match for "${input}"`);
  assert.equal(match.commandKey, "nuevo", `Expected command key nuevo for "${input}"`);
}

function assertNotCreationCommand(input: string) {
  const match = matchConversationCommand(input);
  assert.notEqual(match.commandKey, "nuevo", `Did not expect nuevo for "${input}"`);
}

function main() {
  for (const command of creationCommands) {
    assertCreationCommand(command);
  }

  for (const command of nonCreationCommands) {
    assertNotCreationCommand(command);
  }

  const skuInputs = [
    { input: "mis productos FJ-ROP-260410-AB12CD", sku: "FJ-ROP-260410-AB12CD" },
    { input: "ver FJ-ROP-260410-AB12CD", sku: "FJ-ROP-260410-AB12CD" },
    { input: "producto sku_demo-99", sku: "SKU_DEMO-99" },
    { input: "sku abcd_1234", sku: "ABCD_1234" },
    { input: "ABCD-1234", sku: "ABCD-1234" },
  ];

  for (const { input, sku } of skuInputs) {
    const match = matchConversationCommand(input);
    assert.equal(match.matched, true, `Expected SKU command match for "${input}"`);
    assert.equal(
      match.commandKey,
      "mis_productos",
      `Expected mis_productos for "${input}"`
    );
    assert.equal(match.skuArg, sku, `Expected SKU ${sku} for "${input}"`);
    assert.equal(
      isGlobalConversationCommand(input),
      true,
      `Expected global SKU command for "${input}"`
    );
  }

  const viewIndexMatch = matchConversationCommand("ver 2");
  assert.equal(viewIndexMatch.commandKey, "ver_producto");
  assert.equal(viewIndexMatch.skuArg, undefined);

  const rejectedSkuInputs = ["producto hola mundo", "sku hola/mundo", "holaaaa", "123456"];

  for (const input of rejectedSkuInputs) {
    const match = matchConversationCommand(input);
    assert.equal(
      match.skuArg,
      undefined,
      `Did not expect a SKU match for "${input}"`
    );
  }

  console.log("✅ Command matcher regressions passed");
}

main();
