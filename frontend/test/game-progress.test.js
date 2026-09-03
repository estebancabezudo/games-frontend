import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createActorsRuntime } from "../actors-runtime.js";
import { applyFlagEffects } from "../flag-effects.js";
import {
  createGameProgressSnapshot,
  GAME_PROGRESS_VERSION,
  restoreGameProgressSnapshot,
} from "../game-progress.js";
import { createGameModel } from "../game-model.js";
import { createGameState } from "../game-state.js";
import { createItemCatalog } from "../item-model.js";
import {
  createScenePositionState,
  saveSceneActorPositions,
} from "../scene-position-state.js";
import { parseYaml } from "../yaml-parser.js";

function actor(id, x, y) {
  return {
    id,
    asset: "assets/player.svg",
    position: { x, y },
    size: { width: 100, height: 200 },
  };
}

function scene(id, actors = []) {
  const result = {
    id,
    viewport: { orientation: "portrait" },
    size: { width: 1000, height: 1000 },
    background: { color: "#ddd" },
  };
  if (actors.length > 0) {
    result.actors = actors;
    result.controlled_actor = actors[0].id;
  }
  return result;
}

function fixture({ emptyActiveScene = false } = {}) {
  const document = {
    game: { id: "example", initial_scene: "yard" },
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
      scene("yard", emptyActiveScene ? [] : [
        actor("player", 200, 800),
        actor("dog", 700, 700),
      ]),
      scene("house", [actor("player", 300, 800)]),
      scene("unused", [actor("player", 500, 800)]),
    ],
  };
  const items = createItemCatalog(document.items);
  const gameState = createGameState(document, items);
  const gameModel = createGameModel(document, gameState, items);
  const positionState = createScenePositionState();
  const yard = gameModel.scenes[0];
  const house = gameModel.scenes[1];
  const activeActorsRuntime = createActorsRuntime(yard.actors, yard.size, yard.depthScale);
  const houseRuntime = createActorsRuntime(house.actors, house.size, house.depthScale);
  if (!emptyActiveScene) {
    activeActorsRuntime.player.position = { x: 400, y: 750 };
    activeActorsRuntime.dog.position = { x: 650, y: 700 };
  }
  houseRuntime.player.position = { x: 450, y: 800 };
  saveSceneActorPositions(positionState, "house", houseRuntime);
  saveSceneActorPositions(positionState, "yard", emptyActiveScene ? {} : {
    player: { position: { x: 900, y: 800 } },
    dog: { position: { x: 800, y: 700 } },
  });
  return { document, items, gameState, gameModel, positionState, activeActorsRuntime };
}

function snapshotFrom(values = fixture()) {
  return createGameProgressSnapshot({
    gameModel: values.gameModel,
    gameState: values.gameState,
    activeSceneId: "yard",
    scenePositionState: values.positionState,
    activeActorsRuntime: values.activeActorsRuntime,
  });
}

test("creates an exact deterministic JSON-safe snapshot with mutable flags only", () => {
  const values = fixture();
  const snapshot = snapshotFrom(values);
  assert.deepEqual(Object.keys(snapshot), [
    "version", "gameId", "activeSceneId", "flags", "inventory", "scenePositions",
  ]);
  assert.equal(snapshot.version, GAME_PROGRESS_VERSION);
  assert.deepEqual(snapshot.flags, {
    electricity_on: true,
    light_switch_on: false,
    drawer_open: false,
  });
  assert.equal(Object.hasOwn(snapshot.flags, "light_on"), false);
  assert.deepEqual(Object.keys(snapshot.scenePositions), ["yard", "house"]);
  assert.deepEqual(Object.keys(snapshot.scenePositions.yard), ["player", "dog"]);
  assert.deepEqual(snapshot.scenePositions.yard, {
    player: { x: 400, y: 750 },
    dog: { x: 650, y: 700 },
  });
  assert.deepEqual(snapshot.scenePositions.house, { player: { x: 450, y: 800 } });
  assert.equal(Object.hasOwn(snapshot.scenePositions, "unused"), false);
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot)), snapshot);
});

test("snapshot copies state and positions and active runtime replaces its older snapshot", () => {
  const values = fixture();
  const snapshot = snapshotFrom(values);
  values.gameState.flags.drawer_open = true;
  values.gameState.inventory.push("coin");
  values.activeActorsRuntime.player.position.x = 999;
  values.positionState.positionsByScene.get("house").get("player").x = 999;
  assert.equal(snapshot.flags.drawer_open, false);
  assert.deepEqual(snapshot.inventory, ["dog_food"]);
  assert.deepEqual(snapshot.scenePositions.yard.player, { x: 400, y: 750 });
  assert.deepEqual(snapshot.scenePositions.house.player, { x: 450, y: 800 });
});

test("snapshot creation validates the active scene and complete matching runtime", () => {
  const values = fixture();
  assert.throws(
    () => createGameProgressSnapshot({
      ...values, activeSceneId: "missing", scenePositionState: values.positionState,
    }),
    /activeSceneId.*escena inexistente: missing/,
  );
  delete values.activeActorsRuntime.dog;
  assert.throws(() => snapshotFrom(values), /activeActorsRuntime\.dog es obligatorio/);
  values.activeActorsRuntime.extra = { position: { x: 1, y: 1 } };
  assert.throws(() => snapshotFrom(values), /activeActorsRuntime.*propiedades desconocidas: extra/);
});

test("an active actorless scene is represented by an empty position object", () => {
  const values = fixture({ emptyActiveScene: true });
  const snapshot = snapshotFrom(values);
  assert.deepEqual(snapshot.scenePositions.yard, {});
  const restored = restoreGameProgressSnapshot(snapshot, values.gameModel);
  assert.deepEqual(
    Object.fromEntries(restored.scenePositionState.positionsByScene.get("yard")),
    {},
  );
});

test("restore rebuilds mutable and computed flags with read-only protection", () => {
  const values = fixture();
  const snapshot = snapshotFrom(values);
  snapshot.flags.light_switch_on = true;
  const restored = restoreGameProgressSnapshot(snapshot, values.gameModel);
  assert.equal(restored.activeSceneId, "yard");
  assert.equal(restored.gameState.flags.light_switch_on, true);
  assert.equal(restored.gameState.flags.light_on, true);
  assert.throws(
    () => applyFlagEffects(restored.gameState, [{ type: "clear_flag", flag: "light_on" }]),
    /clear_flag.*flag calculado: light_on/,
  );
});

test("restore preserves inventory order and creates independent position state", () => {
  const values = fixture();
  const snapshot = snapshotFrom(values);
  snapshot.inventory = ["key", "coin", "dog_food"];
  const restored = restoreGameProgressSnapshot(snapshot, values.gameModel);
  assert.deepEqual(restored.gameState.inventory, ["key", "coin", "dog_food"]);
  const restoredPosition = restored.scenePositionState.positionsByScene.get("yard").get("player");
  restoredPosition.x = 500;
  restored.gameState.inventory.push("coin");
  assert.equal(snapshot.scenePositions.yard.player.x, 400);
  assert.deepEqual(snapshot.inventory, ["key", "coin", "dog_food"]);
});

test("restore rejects root version, identity, scene, shape, and unknown properties", () => {
  const values = fixture();
  const valid = snapshotFrom(values);
  const cases = [
    [{ ...valid, version: 2 }, /snapshot\.version/],
    [without(valid, "version"), /snapshot\.version es obligatorio/],
    [{ ...valid, gameId: "other" }, /snapshot\.gameId/],
    [{ ...valid, activeSceneId: "missing" }, /snapshot\.activeSceneId.*missing/],
    [{ ...valid, extra: true }, /snapshot.*propiedades desconocidas: extra/],
    [null, /snapshot debe ser un objeto simple/],
    [[], /snapshot debe ser un objeto simple/],
  ];
  cases.forEach(([snapshot, expected]) => {
    assert.throws(() => restoreGameProgressSnapshot(snapshot, values.gameModel), expected);
  });
});

test("restore requires exactly all mutable boolean flags and excludes computed flags", () => {
  const values = fixture();
  const valid = snapshotFrom(values);
  for (const [flags, expected] of [
    [{ ...valid.flags, drawer_open: "false" }, /snapshot\.flags\.drawer_open debe ser booleano/],
    [without(valid.flags, "drawer_open"), /snapshot\.flags\.drawer_open es obligatorio/],
    [{ ...valid.flags, unknown: true }, /snapshot\.flags.*propiedades desconocidas: unknown/],
    [{ ...valid.flags, light_on: false }, /snapshot\.flags.*propiedades desconocidas: light_on/],
  ]) {
    assert.throws(
      () => restoreGameProgressSnapshot({ ...valid, flags }, values.gameModel),
      expected,
    );
  }
  assert.throws(
    () => restoreGameProgressSnapshot({ ...valid, flags: null }, values.gameModel),
    /snapshot\.flags debe ser un objeto simple/,
  );
});

test("restore validates inventory structure, ids, and duplicates with precise paths", () => {
  const values = fixture();
  const valid = snapshotFrom(values);
  for (const [inventory, expected] of [
    [null, /snapshot\.inventory debe ser una lista/],
    [["dog_food", "dog_food"], /snapshot\.inventory.*duplicado: dog_food/],
    [["missing"], /snapshot\.inventory\[0\].*item inexistente: missing/],
    [[7], /snapshot\.inventory\[0\] debe ser texto no vacío/],
  ]) {
    assert.throws(
      () => restoreGameProgressSnapshot({ ...valid, inventory }, values.gameModel),
      expected,
    );
  }
});

test("restore validates scene and actor completeness without cross-scene leakage", () => {
  const values = fixture();
  const valid = snapshotFrom(values);
  const cases = [
    [null, /snapshot\.scenePositions debe ser un objeto simple/],
    [{ ...valid.scenePositions, missing: {} }, /snapshot\.scenePositions.*propiedades desconocidas: missing/],
    [without(valid.scenePositions, "yard"), /snapshot\.scenePositions\.yard es obligatorio/],
    [{ ...valid.scenePositions, yard: { player: valid.scenePositions.yard.player } }, /snapshot\.scenePositions\.yard\.dog es obligatorio/],
    [{ ...valid.scenePositions, yard: { ...valid.scenePositions.yard, waiter: { x: 1, y: 1 } } }, /snapshot\.scenePositions\.yard.*propiedades desconocidas: waiter/],
  ];
  cases.forEach(([scenePositions, expected]) => {
    assert.throws(
      () => restoreGameProgressSnapshot({ ...valid, scenePositions }, values.gameModel),
      expected,
    );
  });
});

test("restore rejects malformed, non-finite, negative, and out-of-bounds coordinates", () => {
  const values = fixture();
  const valid = snapshotFrom(values);
  const changedPlayer = (position) => ({
    ...valid,
    scenePositions: {
      ...valid.scenePositions,
      yard: { ...valid.scenePositions.yard, player: position },
    },
  });
  for (const [position, expected] of [
    [{ y: 750 }, /snapshot\.scenePositions\.yard\.player\.x es obligatorio/],
    [{ x: -1, y: 750 }, /snapshot\.scenePositions\.yard\.player\.x debe ser un número finito/],
    [{ x: 400, y: Infinity }, /snapshot\.scenePositions\.yard\.player\.y debe ser un número finito/],
    [{ x: "400", y: 750 }, /snapshot\.scenePositions\.yard\.player\.x debe ser un número finito/],
    [{ x: 0, y: 0 }, /snapshot\.scenePositions\.yard\.player está fuera de los límites/],
    [{ x: 400, y: 750, z: 1 }, /snapshot\.scenePositions\.yard\.player.*propiedades desconocidas: z/],
    [null, /snapshot\.scenePositions\.yard\.player debe ser un objeto simple/],
  ]) {
    assert.throws(() => restoreGameProgressSnapshot(changedPlayer(position), values.gameModel), expected);
  }
});

test("invalid restore is atomic and mutates neither snapshot nor game model", () => {
  const values = fixture();
  const snapshot = snapshotFrom(values);
  const snapshotBefore = structuredClone(snapshot);
  const modelStateBefore = {
    initialInventory: [...values.gameModel.initialState.inventory],
    mutableFlags: {
      electricity_on: values.gameModel.initialState.flags.electricity_on,
      light_switch_on: values.gameModel.initialState.flags.light_switch_on,
      drawer_open: values.gameModel.initialState.flags.drawer_open,
    },
  };
  snapshot.scenePositions.yard.player.x = 0;
  assert.throws(() => restoreGameProgressSnapshot(snapshot, values.gameModel));
  assert.deepEqual(values.gameModel.initialState.inventory, modelStateBefore.initialInventory);
  assert.deepEqual({
    electricity_on: values.gameModel.initialState.flags.electricity_on,
    light_switch_on: values.gameModel.initialState.flags.light_switch_on,
    drawer_open: values.gameModel.initialState.flags.drawer_open,
  }, modelStateBefore.mutableFlags);
  snapshot.scenePositions.yard.player.x = snapshotBefore.scenePositions.yard.player.x;
  assert.deepEqual(snapshot, snapshotBefore);
});

test("current example survives a full JSON round-trip without mutating YAML or models", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const yaml = html.match(/<textarea[^>]*id="yaml-editor"[^>]*>([\s\S]*?)<\/textarea>/)?.[1];
  const document = parseYaml(yaml);
  const documentBefore = structuredClone(document);
  const items = createItemCatalog(document.items);
  const gameState = createGameState(document, items);
  const gameModel = createGameModel(document, gameState, items);
  const yard = gameModel.scenes.find(({ sceneId }) => sceneId === "yard");
  const house = gameModel.scenes.find(({ sceneId }) => sceneId === "house");
  const actors = createActorsRuntime(yard.actors, yard.size, yard.depthScale);
  const positions = createScenePositionState();
  const houseActors = createActorsRuntime(house.actors, house.size, house.depthScale);
  actors.player.position = { x: 1500, y: 900 };
  houseActors.player.position = { x: 400, y: 800 };
  saveSceneActorPositions(positions, "house", houseActors);
  gameState.flags.light_switch_on = true;
  gameState.inventory.splice(0, gameState.inventory.length, "coin", "brass_key");

  const snapshot = createGameProgressSnapshot({
    gameModel,
    gameState,
    activeSceneId: "yard",
    scenePositionState: positions,
    activeActorsRuntime: actors,
  });
  const jsonSnapshot = JSON.parse(JSON.stringify(snapshot));
  const restored = restoreGameProgressSnapshot(jsonSnapshot, gameModel);

  assert.equal(restored.activeSceneId, "yard");
  assert.equal(restored.gameState.flags.light_switch_on, true);
  assert.equal(restored.gameState.flags.light_on, true);
  assert.deepEqual(restored.gameState.inventory, ["coin", "brass_key"]);
  assert.deepEqual(
    Object.fromEntries(restored.scenePositionState.positionsByScene.get("yard")),
    snapshot.scenePositions.yard,
  );
  assert.deepEqual(
    Object.fromEntries(restored.scenePositionState.positionsByScene.get("house")),
    snapshot.scenePositions.house,
  );
  assert.deepEqual(document, documentBefore);
  assert.equal(gameModel.scenes[0], yard);
});

function without(value, property) {
  const copy = { ...value };
  delete copy[property];
  return copy;
}
