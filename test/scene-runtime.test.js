import assert from "node:assert/strict";
import test from "node:test";
import { advanceCharacterRuntime } from "../character-movement.js";
import { setCharacterRoute } from "../character-runtime.js";
import { reconcilePatrolRuntime } from "../actor-patrol.js";
import { createWalkModel } from "../walk-model.js";
import {
  createDialogueTalkingRuntime,
  startDialogueTalking,
} from "../dialogue-timing.js";
import {
  createSceneRuntimeResources,
  disposeSceneRuntimeResources,
} from "../scene-runtime.js";

function actor(id, x, y) {
  return {
    id,
    position: { x, y },
    size: { width: 100, height: 200 },
    visual: { directions: 1 },
    movement: null,
  };
}

function scene(id, actors, overrides = {}) {
  return {
    sceneId: id,
    actors,
    controlledActorId: actors[0]?.id ?? null,
    size: { width: 1000, height: 1000 },
    depthScale: null,
    ...overrides,
  };
}

test("scene runtime resources are independent and use declared actor positions", () => {
  const yard = scene("yard", [actor("player", 200, 800), actor("dog", 700, 800)]);
  const house = scene("house", [actor("player", 500, 600)], {
    size: { width: 1800, height: 900 },
  });
  const yardRuntime = createSceneRuntimeResources(yard);
  yardRuntime.actorsRuntime.player.position.x = 900;
  const houseRuntime = createSceneRuntimeResources(house);
  assert.equal(houseRuntime.selectedInventoryItem, null);
  assert.deepEqual(houseRuntime.actorsRuntime.player.position, { x: 500, y: 600 });
  assert.equal(houseRuntime.actorsRuntime.dog, undefined);
  assert.notEqual(houseRuntime.actorsRuntime, yardRuntime.actorsRuntime);
  assert.equal(Object.hasOwn(houseRuntime, "proximityRuntime"), false);

  const recreatedYard = createSceneRuntimeResources(yard);
  assert.deepEqual(recreatedYard.actorsRuntime.player.position, { x: 200, y: 800 });
});

test("disposing a scene stops loops and clears transient runtimes", () => {
  const resources = createSceneRuntimeResources(scene("yard", [actor("player", 200, 800)]));
  let stops = 0;
  let rendererClears = 0;
  resources.actorMovements.set("player", { stop: () => { stops += 1; } });
  resources.actorsRuntime.player.destination = { x: 500, y: 800 };
  resources.actorsRuntime.player.route = [{ x: 500, y: 800 }];
  resources.actorsRuntime.player.motion = "walking";
  resources.interactionRuntime.pendingInteraction = { targetType: "hotspot", targetId: "door" };
  resources.walkArrivalRuntime.pendingWalkArrival = { nodeId: "door" };
  resources.dialogueRuntime.currentDialogue = { dialogueId: "hello", lineIndex: 0 };
  resources.dialogueSession.participantIds = ["player"];
  let timerCallback = null;
  let timerCleared = false;
  let talkingFinished = false;
  resources.dialogueTalkingRuntime = createDialogueTalkingRuntime({
    set(callback) {
      timerCallback = callback;
      return 1;
    },
    clear() {
      timerCleared = true;
    },
  });
  startDialogueTalking(
    resources.dialogueTalkingRuntime,
    "player",
    "La escena cambiará.",
    () => { talkingFinished = true; },
  );

  disposeSceneRuntimeResources(resources, { clear: () => { rendererClears += 1; } });
  assert.equal(stops, 1);
  assert.equal(rendererClears, 1);
  assert.equal(resources.actorMovements.size, 0);
  assert.equal(resources.actorsRuntime.player.destination, null);
  assert.deepEqual(resources.actorsRuntime.player.route, []);
  assert.equal(resources.actorsRuntime.player.motion, "idle");
  assert.equal(resources.interactionRuntime.pendingInteraction, null);
  assert.equal(resources.walkArrivalRuntime.pendingWalkArrival, null);
  assert.equal(resources.dialogueRuntime.currentDialogue, null);
  assert.deepEqual(resources.dialogueSession.participantIds, []);
  assert.equal(timerCleared, true);
  assert.equal(resources.dialogueTalkingRuntime.talking, false);
  timerCallback();
  assert.equal(talkingFinished, false);
});

test("global state survives runtime replacement without distance triggers", () => {
  const gameState = {
    inventory: ["brass_key"],
    flags: { brass_key_taken: true, house_visited: true },
  };
  const house = scene("house", [actor("player", 100, 500), actor("host", 150, 500)]);
  const resources = createSceneRuntimeResources(house);
  setCharacterRoute(resources.actorsRuntime.host, [{ x: 50, y: 500 }], house.size);
  advanceCharacterRuntime(resources.actorsRuntime.host, 1, 500);
  assert.deepEqual(gameState, {
    inventory: ["brass_key"],
    flags: { brass_key_taken: true, house_visited: true },
  });
  assert.deepEqual(resources.actorsRuntime.host.position, { x: 50, y: 500 });
  assert.equal(Object.hasOwn(resources, "proximityRuntime"), false);
});

test("an autonomous patrol can pass the player without social actions", () => {
  const player = actor("player", 100, 500);
  const dog = actor("dog", 150, 500);
  dog.movement = {
    type: "patrol",
    enabledWhen: null,
    points: [{ x: 150, y: 500 }, { x: 50, y: 500 }],
  };
  const walk = createWalkModel({
    nodes: [{ id: "left", x: 50, y: 500 }, { id: "right", x: 250, y: 500 }],
    paths: [{ from: "left", to: "right" }],
  });
  const model = scene("yard", [player, dog], { walk });
  const resources = createSceneRuntimeResources(model);
  const gameState = { inventory: [], flags: { dialogue_started: false } };

  assert.equal(reconcilePatrolRuntime(
    dog,
    resources.actorsRuntime.dog,
    gameState,
    walk,
    model.size,
  ), "start");
  advanceCharacterRuntime(resources.actorsRuntime.dog, 1, 500);

  assert.ok(resources.actorsRuntime.dog.position.x <= player.position.x);
  assert.equal(gameState.flags.dialogue_started, false);
  assert.equal(Object.hasOwn(resources, "proximityRuntime"), false);
});
