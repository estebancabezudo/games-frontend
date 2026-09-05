import assert from "node:assert/strict";
import test from "node:test";
import { createDialogueRuntime, startDialogue } from "../dialogue-runtime.js";
import { applyGameActions, createGameActions } from "../game-actions.js";

const dialogues = [{
  id: "dog_warning",
  lines: [{ actorId: "dog", text: "Grrrr..." }],
}];

function state() {
  return { inventory: ["dog_food"], flags: { dog_met: false } };
}

const items = [{ id: "dog_food" }, { id: "brass_key" }];

test("creates and executes start_dialogue", () => {
  const gameState = state();
  const runtime = createDialogueRuntime();
  const actions = createGameActions(
    [{ start_dialogue: "dog_warning" }],
    gameState,
    dialogues,
    "effects",
  );

  applyGameActions(gameState, actions, {
    startDialogue: (id) => startDialogue(runtime, id, dialogues),
  });
  assert.deepEqual(actions, [{
    type: "start_dialogue",
    dialogueId: "dog_warning",
  }]);
  assert.equal(runtime.currentDialogue.dialogueId, "dog_warning");
});

test("rejects a start_dialogue reference to an unknown dialogue", () => {
  assert.throws(
    () => createGameActions(
      [{ start_dialogue: "missing" }],
      state(),
      dialogues,
      "effects",
    ),
    /diálogo inexistente: missing/,
  );
});

test("combined flag and dialogue actions execute in declared order", () => {
  const gameState = state();
  const observedFlags = [];
  const actions = createGameActions(
    [
      { set_flag: "dog_met" },
      { start_dialogue: "dog_warning" },
    ],
    gameState,
    dialogues,
    "effects",
  );

  applyGameActions(gameState, actions, {
    startDialogue() {
      observedFlags.push(gameState.flags.dog_met);
    },
  });
  assert.deepEqual(observedFlags, [true]);
});

test("existing set, clear, and toggle flag actions remain supported", () => {
  const gameState = state();
  const actions = createGameActions(
    [
      { set_flag: "dog_met" },
      { toggle_flag: "dog_met" },
      { clear_flag: "dog_met" },
    ],
    gameState,
    dialogues,
    "effects",
  );
  applyGameActions(gameState, actions);
  assert.equal(gameState.flags.dog_met, false);
});

test("give_item and take_item modify inventory in declared order", () => {
  const gameState = state();
  const actions = createGameActions(
    [
      { give_item: "brass_key" },
      { take_item: "dog_food" },
      { set_flag: "dog_met" },
    ],
    gameState,
    dialogues,
    "effects",
    items,
  );
  applyGameActions(gameState, actions);
  assert.deepEqual(gameState.inventory, ["brass_key"]);
  assert.equal(gameState.flags.dog_met, true);
});

test("give_item and take_item reject unknown catalog ids", () => {
  ["give_item", "take_item"].forEach((type) => {
    assert.throws(
      () => createGameActions(
        [{ [type]: "missing" }],
        state(),
        dialogues,
        "effects",
        items,
      ),
      /item inexistente: missing/,
    );
  });
});

test("inventory actions keep no-op semantics for already owned or absent items", () => {
  const gameState = state();
  const actions = createGameActions(
    [
      { give_item: "dog_food" },
      { take_item: "brass_key" },
    ],
    gameState,
    dialogues,
    "effects",
    items,
  );
  applyGameActions(gameState, actions);
  assert.deepEqual(gameState.inventory, ["dog_food"]);
});

test("creates and delegates a valid change_scene", () => {
  const observed = [];
  const actions = createGameActions(
    [{ set_flag: "dog_met" }, { change_scene: "house" }],
    state(),
    dialogues,
    "effects",
    items,
    { allowChangeScene: true, sceneIds: new Set(["yard", "house"]) },
  );
  const gameState = state();
  applyGameActions(gameState, actions, {
    changeScene(sceneId, entryId) {
      observed.push({ sceneId, entryId, flag: gameState.flags.dog_met });
    },
  });
  assert.deepEqual(actions.at(-1), {
    type: "change_scene", sceneId: "house", entryId: null,
  });
  assert.deepEqual(observed, [{ sceneId: "house", entryId: null, flag: true }]);
});

test("normalizes and delegates a change_scene entry", () => {
  const options = {
    allowChangeScene: true,
    sceneIds: new Set(["yard", "house"]),
    sceneEntryIds: new Map([["house", new Set(["from_yard"])]]),
  };
  const actions = createGameActions(
    [{ change_scene: { scene: " house ", entry: " from_yard " } }],
    state(), dialogues, "effects", items, options,
  );
  const calls = [];
  applyGameActions(state(), actions, {
    changeScene: (sceneId, entryId) => calls.push({ sceneId, entryId }),
  });
  assert.deepEqual(actions, [{
    type: "change_scene", sceneId: "house", entryId: "from_yard",
  }]);
  assert.deepEqual(calls, [{ sceneId: "house", entryId: "from_yard" }]);
});

test("change_scene validates context, target, order, and uniqueness", () => {
  const options = { allowChangeScene: true, sceneIds: new Set(["yard", "house"]) };
  assert.throws(
    () => createGameActions(
      [{ change_scene: "house" }], state(), dialogues, "effects", items,
    ),
    /change_scene no está permitido en este contexto/,
  );
  assert.throws(
    () => createGameActions(
      [{ change_scene: { scene: "house", entry: "from_yard" } }],
      state(), dialogues, "effects", items,
    ),
    /change_scene no está permitido en este contexto/,
  );
  assert.throws(
    () => createGameActions(
      [{ change_scene: "missing" }], state(), dialogues, "effects", items, options,
    ),
    /escena inexistente: missing/,
  );
  assert.throws(
    () => createGameActions(
      [{ change_scene: "house" }, { set_flag: "dog_met" }],
      state(), dialogues, "effects", items, options,
    ),
    /change_scene debe ser la última acción/,
  );
  assert.throws(
    () => createGameActions(
      [{ change_scene: "house" }, { change_scene: "yard" }],
      state(), dialogues, "effects", items, options,
    ),
    /más de un change_scene/,
  );
  assert.throws(
    () => createGameActions(
      [{ change_scene: {} }], state(), dialogues, "effects", items, options,
    ),
    /change_scene\.scene debe ser texto no vacío/,
  );
  assert.throws(
    () => createGameActions(
      [{ change_scene: { scene: "house", extra: "x" } }],
      state(), dialogues, "effects", items, options,
    ),
    /propiedades desconocidas: extra/,
  );
  assert.throws(
    () => createGameActions(
      [{ change_scene: { scene: "house", entry: "missing" } }],
      state(), dialogues, "effects", items,
      { ...options, sceneEntryIds: new Map([["house", new Set()]]) },
    ),
    /entrada inexistente en house: missing/,
  );
});
