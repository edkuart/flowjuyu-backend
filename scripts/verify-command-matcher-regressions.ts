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

  console.log("✅ Command matcher regressions passed");
}

main();
