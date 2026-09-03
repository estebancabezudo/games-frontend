import assert from "node:assert/strict";
import test from "node:test";
import { createActorsRuntime } from "../actors-runtime.js";
import { applyFlagEffects } from "../flag-effects.js";
import { createGameModel } from "../game-model.js";
import {
  createGameProgressSnapshot,
  GAME_PROGRESS_VERSION,
} from "../game-progress.js";
import {
  GAME_PROGRESS_STORAGE_PREFIX,
  gameProgressStorageKey,
  loadGameProgressSnapshot,
  removeGameProgressSnapshot,
  saveGameProgressSnapshot,
} from "../game-progress-storage.js";
import { createGameState } from "../game-state.js";
import { createItemCatalog } from "../item-model.js";
import {
  createScenePositionState,
  saveSceneActorPositions,
} from "../scene-position-state.js";

function actor(id, x, y) {
  return {
    id,
    asset: "assets/player.svg",
    position: { x, y },
    size: { width: 100, height: 200 },
  };
}

function scene(id, actors) {
  return {
    id,
    viewport: { orientation: "portrait" },
    size: { width: 1000, height: 1000 },
    background: { color: "#ddd" },
    actors,
    controlled_actor: actors[0].id,
  };
}

function fixture(gameId = "example") {
  const document = {
    game: { id: gameId, initial_scene: "yard" },
    items: [{ id: "dog_food" }, { id: "coin" }, { id: "key" }],
    state: {
      inventory: ["dog_food"],
      flags: {
        electricity_on: true,
        light_switch_on: false,
        light_on: "electricity_on and light_switch_on",
        drawer_open: false,
      },
    },
    scenes: [
      scene("yard", [actor("player", 200, 800), actor("dog", 700, 700)]),
      scene("house", [actor("player", 300, 800)]),
    ],
  };
  const items = createItemCatalog(document.items);
  const gameState = createGameState(document, items);
  const gameModel = createGameModel(document, gameState, items);
  const scenePositionState = createScenePositionState();
  const yard = gameModel.scenes[0];
  const house = gameModel.scenes[1];
  const activeActorsRuntime = createActorsRuntime(yard.actors, yard.size, yard.depthScale);
  const houseRuntime = createActorsRuntime(house.actors, house.size, house.depthScale);
  activeActorsRuntime.player.position = { x: 400, y: 750 };
  activeActorsRuntime.dog.position = { x: 650, y: 700 };
  houseRuntime.player.position = { x: 450, y: 800 };
  saveSceneActorPositions(scenePositionState, "house", houseRuntime);
  const snapshot = createGameProgressSnapshot({
    gameModel,
    gameState,
    activeSceneId: "yard",
    scenePositionState,
    activeActorsRuntime,
  });
  return {
    document,
    gameModel,
    gameState,
    scenePositionState,
    activeActorsRuntime,
    snapshot,
  };
}

function memoryStorage() {
  const values = new Map();
  return {
    values,
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

test("storage keys are deterministic, normalized, encoded, and isolated by game", () => {
  assert.equal(
    gameProgressStorageKey(" example game "),
    `${GAME_PROGRESS_STORAGE_PREFIX}:example%20game`,
  );
  assert.equal(gameProgressStorageKey("example"), gameProgressStorageKey(" example "));
  assert.notEqual(gameProgressStorageKey("one"), gameProgressStorageKey("two"));
  for (const value of [null, undefined, 4, "", "   "]) {
    assert.throws(() => gameProgressStorageKey(value), /gameId debe ser texto no vacío/);
  }
});

test("saves a valid snapshot as independent JSON-safe text", () => {
  const values = fixture();
  const storage = memoryStorage();
  const snapshotBefore = structuredClone(values.snapshot);
  saveGameProgressSnapshot(storage, values.snapshot, values.gameModel);
  const text = storage.getItem(gameProgressStorageKey("example"));
  assert.equal(typeof text, "string");
  assert.deepEqual(JSON.parse(text), snapshotBefore);
  values.snapshot.flags.drawer_open = true;
  values.snapshot.inventory.push("coin");
  assert.deepEqual(JSON.parse(text), snapshotBefore);
});

test("load restores mutable and computed flags with read-only protection", () => {
  const values = fixture();
  const storage = memoryStorage();
  values.snapshot.flags.light_switch_on = true;
  saveGameProgressSnapshot(storage, values.snapshot, values.gameModel);
  const restored = loadGameProgressSnapshot(storage, values.gameModel);
  assert.equal(restored.activeSceneId, "yard");
  assert.equal(restored.gameState.flags.light_switch_on, true);
  assert.equal(restored.gameState.flags.light_on, true);
  assert.throws(
    () => applyFlagEffects(restored.gameState, [{ type: "clear_flag", flag: "light_on" }]),
    /clear_flag.*flag calculado: light_on/,
  );
});

test("load preserves inventory order and independent scene positions", () => {
  const values = fixture();
  const storage = memoryStorage();
  values.snapshot.inventory = ["key", "coin", "dog_food"];
  saveGameProgressSnapshot(storage, values.snapshot, values.gameModel);
  const restored = loadGameProgressSnapshot(storage, values.gameModel);
  assert.deepEqual(restored.gameState.inventory, ["key", "coin", "dog_food"]);
  assert.deepEqual(
    restored.scenePositionState.positionsByScene.get("yard").get("player"),
    { x: 400, y: 750 },
  );
  assert.deepEqual(
    restored.scenePositionState.positionsByScene.get("house").get("player"),
    { x: 450, y: 800 },
  );
  restored.scenePositionState.positionsByScene.get("yard").get("player").x = 500;
  assert.equal(values.snapshot.scenePositions.yard.player.x, 400);
});

test("load returns null when no saved progress exists", () => {
  const values = fixture();
  assert.equal(loadGameProgressSnapshot(memoryStorage(), values.gameModel), null);
});

test("remove deletes only the selected game's progress", () => {
  const one = fixture("one");
  const two = fixture("two");
  const storage = memoryStorage();
  saveGameProgressSnapshot(storage, one.snapshot, one.gameModel);
  saveGameProgressSnapshot(storage, two.snapshot, two.gameModel);
  removeGameProgressSnapshot(storage, "one");
  assert.equal(loadGameProgressSnapshot(storage, one.gameModel), null);
  assert.notEqual(loadGameProgressSnapshot(storage, two.gameModel), null);
});

test("saved games with different ids never share a storage key", () => {
  const one = fixture("one");
  const two = fixture("two");
  const storage = memoryStorage();
  saveGameProgressSnapshot(storage, one.snapshot, one.gameModel);
  saveGameProgressSnapshot(storage, two.snapshot, two.gameModel);
  assert.equal(storage.values.size, 2);
  assert.equal(JSON.parse(storage.getItem(gameProgressStorageKey("one"))).gameId, "one");
  assert.equal(JSON.parse(storage.getItem(gameProgressStorageKey("two"))).gameId, "two");
});

test("corrupt JSON is reported with its cause and remains stored", () => {
  const values = fixture();
  const storage = memoryStorage();
  const key = gameProgressStorageKey("example");
  storage.setItem(key, "{broken");
  assert.throws(
    () => loadGameProgressSnapshot(storage, values.gameModel),
    (error) => /JSON corrupto/.test(error.message) && error.cause instanceof SyntaxError,
  );
  assert.equal(storage.getItem(key), "{broken");
});

test("valid JSON with incompatible version or game id is reported without removal", () => {
  const values = fixture();
  for (const change of [
    { version: GAME_PROGRESS_VERSION + 1 },
    { gameId: "other" },
  ]) {
    const storage = memoryStorage();
    const key = gameProgressStorageKey("example");
    const text = JSON.stringify({ ...values.snapshot, ...change });
    storage.setItem(key, text);
    assert.throws(
      () => loadGameProgressSnapshot(storage, values.gameModel),
      (error) => /incompatible o inválido/.test(error.message) && error.cause instanceof Error,
    );
    assert.equal(storage.getItem(key), text);
  }
});

test("invalid flags, inventory, and positions are rejected through snapshot validation", () => {
  const values = fixture();
  const invalidSnapshots = [
    { ...values.snapshot, flags: { ...values.snapshot.flags, drawer_open: "false" } },
    { ...values.snapshot, inventory: ["missing"] },
    {
      ...values.snapshot,
      scenePositions: {
        ...values.snapshot.scenePositions,
        yard: {
          ...values.snapshot.scenePositions.yard,
          player: { x: -1, y: 750 },
        },
      },
    },
  ];
  invalidSnapshots.forEach((snapshot) => {
    const storage = memoryStorage();
    storage.setItem(gameProgressStorageKey("example"), JSON.stringify(snapshot));
    assert.throws(
      () => loadGameProgressSnapshot(storage, values.gameModel),
      (error) => /incompatible o inválido/.test(error.message) && /snapshot\./.test(error.cause.message),
    );
  });
});

test("failed save validation leaves an existing stored value unchanged", () => {
  const values = fixture();
  const storage = memoryStorage();
  const key = gameProgressStorageKey("example");
  storage.setItem(key, "previous");
  const invalid = { ...values.snapshot, inventory: ["missing"] };
  assert.throws(() => saveGameProgressSnapshot(storage, invalid, values.gameModel), /item inexistente/);
  assert.equal(storage.getItem(key), "previous");
});

test("storage read, write, and removal failures propagate with context and cause", () => {
  const values = fixture();
  const failure = new Error("storage unavailable");
  const failing = (method) => ({
    getItem() {
      if (method === "getItem") throw failure;
      return null;
    },
    setItem() {
      if (method === "setItem") throw failure;
    },
    removeItem() {
      if (method === "removeItem") throw failure;
    },
  });
  for (const [operation, expected] of [
    [() => loadGameProgressSnapshot(failing("getItem"), values.gameModel), /No se pudo leer/],
    [() => saveGameProgressSnapshot(failing("setItem"), values.snapshot, values.gameModel), /No se pudo guardar/],
    [() => removeGameProgressSnapshot(failing("removeItem"), "example"), /No se pudo eliminar/],
  ]) {
    assert.throws(operation, (error) => expected.test(error.message) && error.cause === failure);
  }
});

test("storage dependencies must implement the operation they are asked to perform", () => {
  const values = fixture();
  assert.throws(() => saveGameProgressSnapshot({}, values.snapshot, values.gameModel), /storage\.setItem/);
  assert.throws(() => loadGameProgressSnapshot({}, values.gameModel), /storage\.getItem/);
  assert.throws(() => removeGameProgressSnapshot({}, "example"), /storage\.removeItem/);
});

test("create, save, and load form a complete independent round-trip", () => {
  const values = fixture();
  const storage = memoryStorage();
  const documentBefore = structuredClone(values.document);
  const snapshotBefore = structuredClone(values.snapshot);
  saveGameProgressSnapshot(storage, values.snapshot, values.gameModel);
  const restored = loadGameProgressSnapshot(storage, values.gameModel);
  restored.gameState.flags.drawer_open = true;
  restored.gameState.inventory.push("coin");
  restored.scenePositionState.positionsByScene.get("yard").get("dog").x = 600;

  assert.deepEqual(values.snapshot, snapshotBefore);
  assert.deepEqual(values.document, documentBefore);
  assert.equal(values.gameModel.initialState.flags.drawer_open, false);
  assert.deepEqual(
    JSON.parse(storage.getItem(gameProgressStorageKey("example"))),
    snapshotBefore,
  );
});
