import assert from "node:assert/strict";
import test from "node:test";
import { createGameState } from "../game-state.js";
import { parseYaml } from "../yaml-parser.js";

test("creates inventory and flags from the YAML state", () => {
const document = parseYaml(`
items:
  - id: key
state:
  inventory:
    - key
  flags:
    door_open: false
`);

  assert.deepEqual(createGameState(document), {
    inventory: ["key"],
    flags: { door_open: false },
  });
});

test("rejects inventory entries that are not text", () => {
  assert.throws(
    () => createGameState({ items: [{ id: "key" }], state: { inventory: [42], flags: {} } }),
    /state\.inventory\[0\] debe ser un texto no vacío/,
  );
});

test("rejects a string that is not a complete flag expression", () => {
  assert.throws(
    () => createGameState({
      items: [],
      state: { inventory: [], flags: { door_open: "false" } },
    }),
    /debe contener operando, operador y operando/,
  );
});

test("rejects unknown and duplicate initial inventory items", () => {
  assert.throws(
    () => createGameState({
      items: [{ id: "key" }],
      state: { inventory: ["missing"], flags: {} },
    }),
    /item inexistente: missing/,
  );
  assert.throws(
    () => createGameState({
      items: [{ id: "key" }],
      state: { inventory: ["key", "key"], flags: {} },
    }),
    /state\.inventory contiene un id duplicado: key/,
  );
});
