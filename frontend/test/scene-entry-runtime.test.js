import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createActorsRuntime } from "../actors-runtime.js";
import { applySceneEntry } from "../scene-entry-runtime.js";
import { createGameModel } from "../game-model.js";
import { createGameState } from "../game-state.js";
import { createItemCatalog } from "../item-model.js";
import {
  createScenePositionState,
  restoreSceneActorPositions,
  saveSceneActorPositions,
} from "../scene-position-state.js";
import { parseYaml } from "../yaml-parser.js";

function actor(id, x, y, directions = 4) {
  return {
    id,
    position: { x, y },
    size: { width: 100, height: 200 },
    visual: { directions },
    movement: null,
  };
}

function scene(entries = []) {
  return {
    sceneId: "yard",
    actors: [actor("player", 200, 800), actor("dog", 700, 700, 2)],
    controlledActorId: "player",
    size: { width: 1000, height: 1000 },
    depthScale: null,
    entries,
  };
}

test("applies entry position and facing only to the controlled actor", () => {
  const model = scene([{ id: "door", position: { x: 400, y: 800 }, facing: "down" }]);
  const runtimes = createActorsRuntime(model.actors, model.size, model.depthScale);
  const dogPosition = { ...runtimes.dog.position };
  runtimes.player.route = [{ x: 900, y: 900 }];
  runtimes.player.destination = runtimes.player.route[0];
  runtimes.player.motion = "walking";

  applySceneEntry(model, runtimes, "door");

  assert.deepEqual(runtimes.player.position, { x: 400, y: 800 });
  assert.equal(runtimes.player.facing, "down");
  assert.equal(runtimes.player.motion, "idle");
  assert.deepEqual(runtimes.player.route, []);
  assert.equal(runtimes.player.destination, null);
  assert.deepEqual(runtimes.dog.position, dogPosition);
});

test("constrains entry position with existing actor bounds", () => {
  const model = scene([{ id: "edge", position: { x: 0, y: 0 }, facing: null }]);
  const runtimes = createActorsRuntime(model.actors, model.size, model.depthScale);
  applySceneEntry(model, runtimes, "edge");
  assert.deepEqual(runtimes.player.position, { x: 50, y: 200 });
});

test("entry without facing preserves the newly created runtime facing", () => {
  const model = scene([{ id: "door", position: { x: 300, y: 700 }, facing: null }]);
  const runtimes = createActorsRuntime(model.actors, model.size, model.depthScale);
  const initialFacing = runtimes.player.facing;
  applySceneEntry(model, runtimes, "door");
  assert.equal(runtimes.player.facing, initialFacing);
});

test("explicit entry overrides a restored snapshot while null entry preserves it", () => {
  const model = scene([{ id: "door", position: { x: 400, y: 800 }, facing: "left" }]);
  const state = createScenePositionState();
  const previous = createActorsRuntime(model.actors, model.size, model.depthScale);
  previous.player.position = { x: 850, y: 750 };
  saveSceneActorPositions(state, model.sceneId, previous);

  const withEntry = createActorsRuntime(model.actors, model.size, model.depthScale);
  restoreSceneActorPositions(state, model.sceneId, withEntry);
  applySceneEntry(model, withEntry, "door");
  assert.deepEqual(withEntry.player.position, { x: 400, y: 800 });

  const withoutEntry = createActorsRuntime(model.actors, model.size, model.depthScale);
  restoreSceneActorPositions(state, model.sceneId, withoutEntry);
  applySceneEntry(model, withoutEntry, null);
  assert.deepEqual(withoutEntry.player.position, { x: 850, y: 750 });
});

test("applying entries does not mutate model, global state, or normalized entry", () => {
  const model = scene([{ id: "door", position: { x: 400, y: 800 }, facing: "left" }]);
  const modelBefore = structuredClone(model);
  const gameState = { inventory: ["key"], flags: { open: true } };
  const stateBefore = structuredClone(gameState);
  const runtimes = createActorsRuntime(model.actors, model.size, model.depthScale);
  applySceneEntry(model, runtimes, "door");
  assert.deepEqual(model, modelBefore);
  assert.deepEqual(gameState, stateBefore);
});

test("the example transitions apply declared entries over prior scene snapshots", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const yaml = html.match(/<textarea[^>]*id="yaml-editor"[^>]*>([\s\S]*?)<\/textarea>/)?.[1];
  const document = parseYaml(yaml);
  const items = createItemCatalog(document.items);
  const gameState = createGameState(document, items);
  const game = createGameModel(document, gameState, items);
  const yard = game.scenes.find(({ sceneId }) => sceneId === "yard");
  const house = game.scenes.find(({ sceneId }) => sceneId === "house");
  const positionState = createScenePositionState();

  assert.deepEqual(yard.entries, [{
    id: "from_house", position: { x: 1500, y: 900 }, facing: "down",
  }]);
  assert.deepEqual(house.entries, [{
    id: "from_yard", position: { x: 400, y: 800 }, facing: "default",
  }]);
  assert.deepEqual(
    yard.hotspots.find(({ id }) => id === "house_door").effects.at(-1),
    { type: "change_scene", sceneId: "house", entryId: "from_yard" },
  );
  assert.deepEqual(
    house.hotspots.find(({ id }) => id === "exit_to_yard").effects.at(-1),
    { type: "change_scene", sceneId: "yard", entryId: "from_house" },
  );

  const oldYard = createActorsRuntime(yard.actors, yard.size, yard.depthScale);
  oldYard.player.position = { x: 2500, y: 1000 };
  saveSceneActorPositions(positionState, "yard", oldYard);
  const restoredYard = createActorsRuntime(yard.actors, yard.size, yard.depthScale);
  restoreSceneActorPositions(positionState, "yard", restoredYard);
  applySceneEntry(yard, restoredYard, "from_house");
  assert.deepEqual(restoredYard.player.position, { x: 1500, y: 900 });
  assert.equal(restoredYard.player.facing, "down");

  const oldHouse = createActorsRuntime(house.actors, house.size, house.depthScale);
  oldHouse.player.position = { x: 1400, y: 800 };
  saveSceneActorPositions(positionState, "house", oldHouse);
  const restoredHouse = createActorsRuntime(house.actors, house.size, house.depthScale);
  restoreSceneActorPositions(positionState, "house", restoredHouse);
  applySceneEntry(house, restoredHouse, "from_yard");
  assert.deepEqual(restoredHouse.player.position, { x: 400, y: 800 });
  assert.equal(restoredHouse.player.facing, "default");
});
