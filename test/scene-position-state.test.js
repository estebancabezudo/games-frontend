import assert from "node:assert/strict";
import test from "node:test";
import { reconcilePatrolRuntime } from "../actor-patrol.js";
import { createSceneRuntimeResources, disposeSceneRuntimeResources } from "../scene-runtime.js";
import {
  clearScenePositionState,
  copyScenePositionSnapshots,
  createScenePositionState,
  restoreSceneActorPositions,
  saveSceneActorPositions,
  setScenePositionSnapshot,
} from "../scene-position-state.js";
import { createWalkModel } from "../walk-model.js";

function actor(id, x, y, movement = null) {
  return {
    id,
    position: { x, y },
    size: { width: 100, height: 200 },
    visual: { directions: 2 },
    movement,
  };
}

function scene(sceneId, actors, overrides = {}) {
  return {
    sceneId,
    actors,
    controlledActorId: actors[0]?.id ?? null,
    size: { width: 1000, height: 1000 },
    depthScale: null,
    walk: null,
    ...overrides,
  };
}

test("a new position state is empty and an unsaved scene keeps YAML positions", () => {
  const positionState = createScenePositionState();
  const model = scene("yard", [actor("player", 200, 800), actor("dog", 700, 600)]);
  const resources = createSceneRuntimeResources(model);

  assert.equal(positionState.positionsByScene.size, 0);
  restoreSceneActorPositions(positionState, model.sceneId, resources.actorsRuntime);
  assert.deepEqual(resources.actorsRuntime.player.position, { x: 200, y: 800 });
  assert.deepEqual(resources.actorsRuntime.dog.position, { x: 700, y: 600 });
});

test("saving copies every actor position without retaining runtime references", () => {
  const positionState = createScenePositionState();
  const resources = createSceneRuntimeResources(scene("yard", [
    actor("player", 200, 800),
    actor("dog", 700, 600),
  ]));
  const playerPosition = resources.actorsRuntime.player.position;

  saveSceneActorPositions(positionState, "yard", resources.actorsRuntime);
  const snapshot = positionState.positionsByScene.get("yard");
  assert.deepEqual(Object.fromEntries(snapshot), {
    player: { x: 200, y: 800 },
    dog: { x: 700, y: 600 },
  });
  assert.notEqual(snapshot.get("player"), playerPosition);

  resources.actorsRuntime.player.position.x = 999;
  resources.actorsRuntime.dog.position = { x: 1, y: 2 };
  assert.deepEqual(snapshot.get("player"), { x: 200, y: 800 });
  assert.deepEqual(snapshot.get("dog"), { x: 700, y: 600 });
});

test("restoring creates fresh position objects and preserves unsaved actors", () => {
  const positionState = createScenePositionState();
  const original = createSceneRuntimeResources(scene("yard", [
    actor("player", 200, 800),
    actor("removed_actor", 600, 700),
  ]));
  original.actorsRuntime.player.position = { x: 450, y: 550 };
  saveSceneActorPositions(positionState, "yard", original.actorsRuntime);
  const snapshotPosition = positionState.positionsByScene.get("yard").get("player");
  const recreated = createSceneRuntimeResources(scene("yard", [
    actor("player", 200, 800),
    actor("new_actor", 300, 400),
  ]));

  restoreSceneActorPositions(positionState, "yard", recreated.actorsRuntime);
  assert.deepEqual(recreated.actorsRuntime.player.position, { x: 450, y: 550 });
  assert.notEqual(recreated.actorsRuntime.player.position, snapshotPosition);
  assert.deepEqual(recreated.actorsRuntime.new_actor.position, { x: 300, y: 400 });
  assert.equal(recreated.actorsRuntime.removed_actor, undefined);

  recreated.actorsRuntime.player.position.x = 777;
  assert.deepEqual(snapshotPosition, { x: 450, y: 550 });
});

test("scene and actor ids scope independent snapshots", () => {
  const positionState = createScenePositionState();
  const yard = createSceneRuntimeResources(scene("yard", [
    actor("player", 100, 800),
    actor("dog", 600, 700),
  ]));
  const house = createSceneRuntimeResources(scene("house", [actor("player", 300, 500)]));
  yard.actorsRuntime.player.position = { x: 800, y: 700 };
  yard.actorsRuntime.dog.position = { x: 500, y: 600 };
  house.actorsRuntime.player.position = { x: 400, y: 450 };
  saveSceneActorPositions(positionState, "yard", yard.actorsRuntime);
  saveSceneActorPositions(positionState, "house", house.actorsRuntime);

  const restoredYard = createSceneRuntimeResources(scene("yard", [
    actor("player", 100, 800),
    actor("dog", 600, 700),
  ]));
  const restoredHouse = createSceneRuntimeResources(scene("house", [actor("player", 300, 500)]));
  restoreSceneActorPositions(positionState, "yard", restoredYard.actorsRuntime);
  restoreSceneActorPositions(positionState, "house", restoredHouse.actorsRuntime);

  assert.deepEqual(restoredYard.actorsRuntime.player.position, { x: 800, y: 700 });
  assert.deepEqual(restoredYard.actorsRuntime.dog.position, { x: 500, y: 600 });
  assert.deepEqual(restoredHouse.actorsRuntime.player.position, { x: 400, y: 450 });
});

test("saving a scene again replaces its previous snapshot and clearing removes all scenes", () => {
  const positionState = createScenePositionState();
  const resources = createSceneRuntimeResources(scene("yard", [actor("player", 100, 800)]));
  saveSceneActorPositions(positionState, "yard", resources.actorsRuntime);
  resources.actorsRuntime.player.position = { x: 650, y: 750 };
  saveSceneActorPositions(positionState, "yard", resources.actorsRuntime);
  saveSceneActorPositions(positionState, "house", {
    player: { position: { x: 300, y: 400 } },
  });

  assert.deepEqual(positionState.positionsByScene.get("yard").get("player"), {
    x: 650,
    y: 750,
  });
  assert.equal(positionState.positionsByScene.size, 2);
  clearScenePositionState(positionState);
  assert.equal(positionState.positionsByScene.size, 0);
});

test("scene recreation restores only coordinates and rebuilds transient actor runtime", () => {
  const walk = createWalkModel({
    nodes: [
      { id: "left", x: 100, y: 700 },
      { id: "right", x: 900, y: 700 },
    ],
    paths: [{ from: "left", to: "right" }],
  });
  const dogMovement = {
    type: "patrol",
    enabledWhen: null,
    points: [{ x: 200, y: 700 }, { x: 800, y: 700 }],
  };
  const model = scene("yard", [
    actor("player", 200, 700),
    actor("dog", 700, 700, dogMovement),
  ], { walk });
  const positionState = createScenePositionState();
  const original = createSceneRuntimeResources(model);
  original.actorsRuntime.player.position = { x: 450, y: 700 };
  original.actorsRuntime.player.route = [{ x: 500, y: 700 }];
  original.actorsRuntime.player.destination = original.actorsRuntime.player.route[0];
  original.actorsRuntime.player.facing = "left";
  original.actorsRuntime.player.motion = "walking";
  original.actorsRuntime.player.visualStateOverride = "talking";
  original.actorsRuntime.player.visualStateRevision = 9;
  original.actorsRuntime.dog.position = { x: 550, y: 700 };
  original.actorsRuntime.dog.autonomousMovement.nextPointIndex = 1;
  original.actorsRuntime.dog.autonomousMovement.error = "old error";
  saveSceneActorPositions(positionState, model.sceneId, original.actorsRuntime);
  disposeSceneRuntimeResources(original);

  const recreated = createSceneRuntimeResources(model);
  restoreSceneActorPositions(positionState, model.sceneId, recreated.actorsRuntime);

  assert.deepEqual(recreated.actorsRuntime.player.position, { x: 450, y: 700 });
  assert.deepEqual(recreated.actorsRuntime.dog.position, { x: 550, y: 700 });
  assert.deepEqual(recreated.actorsRuntime.player.route, []);
  assert.equal(recreated.actorsRuntime.player.destination, null);
  assert.equal(recreated.actorsRuntime.player.facing, "right");
  assert.equal(recreated.actorsRuntime.player.motion, "idle");
  assert.equal(recreated.actorsRuntime.player.visualStateOverride, null);
  assert.equal(recreated.actorsRuntime.player.visualStateRevision, 0);
  assert.deepEqual(recreated.actorsRuntime.dog.autonomousMovement, {
    type: "patrol",
    nextPointIndex: 0,
    error: null,
  });

  const gameState = { inventory: ["coin"], flags: {} };
  assert.equal(reconcilePatrolRuntime(
    model.actors[1],
    recreated.actorsRuntime.dog,
    gameState,
    walk,
    model.size,
  ), "start");
  assert.deepEqual(recreated.actorsRuntime.dog.position, { x: 550, y: 700 });
  assert.equal(recreated.actorsRuntime.dog.motion, "walking");
  assert.deepEqual(gameState, { inventory: ["coin"], flags: {} });
});

test("position persistence does not mutate scene declarations or global state", () => {
  const positionState = createScenePositionState();
  const model = scene("yard", [actor("player", 200, 800), actor("dog", 700, 600)]);
  const modelBefore = structuredClone(model);
  const gameState = { inventory: ["coin"], flags: { drawer_open: true } };
  const gameStateBefore = structuredClone(gameState);
  const resources = createSceneRuntimeResources(model);
  resources.actorsRuntime.player.position = { x: 400, y: 750 };

  saveSceneActorPositions(positionState, model.sceneId, resources.actorsRuntime);
  const recreated = createSceneRuntimeResources(model);
  restoreSceneActorPositions(positionState, model.sceneId, recreated.actorsRuntime);

  assert.deepEqual(model, modelBefore);
  assert.deepEqual(gameState, gameStateBefore);
  assert.deepEqual(recreated.actorsRuntime.player.position, { x: 400, y: 750 });
});

test("position snapshots can be copied and loaded without sharing references", () => {
  const state = createScenePositionState();
  const source = { player: { x: 300, y: 700 } };
  setScenePositionSnapshot(state, "yard", source);
  source.player.x = 999;

  const copy = copyScenePositionSnapshots(state);
  assert.deepEqual(copy.get("yard").get("player"), { x: 300, y: 700 });
  copy.get("yard").get("player").x = 1;
  assert.deepEqual(state.positionsByScene.get("yard").get("player"), { x: 300, y: 700 });
});
