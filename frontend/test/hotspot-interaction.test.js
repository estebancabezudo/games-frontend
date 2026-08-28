import assert from "node:assert/strict";
import test from "node:test";
import { createCharacterMovementLoop } from "../character-movement.js";
import { createCharacterRuntime, setCharacterRoute } from "../character-runtime.js";
import { applyFlagEffects } from "../flag-effects.js";
import {
  calculateHotspotApproachRoute,
} from "../hotspot-interaction.js";
import {
  cancelPendingInteraction,
  capturedItemForTarget,
  createInteractionRuntime,
  resolvePendingInteraction,
  setPendingInteraction,
  takePendingInteraction,
} from "../interaction-runtime.js";
import { createWalkModel } from "../walk-model.js";

function connectedWalk() {
  return createWalkModel({
    nodes: [
      { id: "left", x: 0, y: 100 },
      { id: "corner", x: 500, y: 100 },
      { id: "right", x: 500, y: 500 },
    ],
    paths: [
      { from: "left", to: "corner" },
      { from: "corner", to: "right" },
    ],
  });
}

function scene(hotspots) {
  return { hotspots };
}

function createArrivalHarness(onRouteComplete) {
  const runtime = createCharacterRuntime({
    id: "player",
    asset: "assets/player.svg",
    position: { x: 0, y: 0 },
    size: { width: 10, height: 20 },
  });
  setCharacterRoute(runtime, [{ x: 100, y: 0 }], { width: 200, height: 200 });
  const callbacks = [];
  const loop = createCharacterMovementLoop(
    runtime,
    () => {},
    onRouteComplete,
    {
      request(callback) {
        callbacks.push(callback);
        return callbacks.length;
      },
      cancel() {},
    },
  );
  loop.start();
  callbacks.shift()(0);
  return {
    arrive() {
      callbacks.shift()(1000);
    },
  };
}

test("a hotspot without approach keeps immediate interaction semantics", () => {
  const hotspot = { id: "switch", approach: null, effects: [{ type: "toggle_flag", flag: "on" }] };
  const state = { inventory: [], flags: { on: false } };

  applyFlagEffects(state, hotspot.effects);

  assert.equal(state.flags.on, true);
});

test("an approach route projects the declared point without changing it", () => {
  const hotspot = { id: "lever", approach: { x: 470, y: 300 } };

  const route = calculateHotspotApproachRoute(
    connectedWalk(),
    { x: 100, y: 100 },
    hotspot,
  );

  assert.deepEqual(route.at(-1), { x: 500, y: 300 });
  assert.deepEqual(hotspot.approach, { x: 470, y: 300 });
});

test("a hotspot with approach does not execute before pending interaction is resolved", () => {
  const state = { inventory: [], flags: { on: false } };
  const hotspot = {
    id: "switch",
    approach: { x: 500, y: 300 },
    effects: [{ type: "toggle_flag", flag: "on" }],
  };
  const runtime = createInteractionRuntime();
  setPendingInteraction(runtime, "hotspot", hotspot.id);
  const arrival = createArrivalHarness(() => {
    const interaction = resolvePendingInteraction(
      takePendingInteraction(runtime),
      scene([hotspot]),
      null,
      state,
    );
    applyFlagEffects(state, interaction.effects);
  });

  assert.equal(state.flags.on, false);
  arrival.arrive();
  assert.equal(state.flags.on, true);
});

test("an item interaction is resolved with the item captured when approach starts", () => {
  const hotspot = { id: "dog", approach: { x: 200, y: 300 }, effects: [] };
  const useInteraction = {
    itemId: "dog_food",
    targetType: "hotspot",
    targetId: "dog",
    effects: [{ type: "set_flag", flag: "dog_fed" }],
  };
  const state = { inventory: ["dog_food", "key"], flags: { dog_fed: false } };
  const runtime = createInteractionRuntime();
  const capturedItem = capturedItemForTarget(
    "hotspot",
    hotspot.id,
    "dog_food",
    useInteraction,
  );
  setPendingInteraction(runtime, "hotspot", hotspot.id, capturedItem);
  const laterSelection = "key";
  const arrival = createArrivalHarness(() => {
    const interaction = resolvePendingInteraction(
      takePendingInteraction(runtime),
      scene([hotspot]),
      useInteraction,
      state,
    );
    applyFlagEffects(state, interaction.effects);
  });

  assert.equal(laterSelection, "key");
  assert.equal(state.flags.dog_fed, false);
  arrival.arrive();
  assert.equal(state.flags.dog_fed, true);
});

test("a free click cancels the pending interaction", () => {
  const runtime = createInteractionRuntime();
  setPendingInteraction(runtime, "hotspot", "lever");

  cancelPendingInteraction(runtime);

  assert.equal(runtime.pendingInteraction, null);
});

test("a new hotspot replaces the previous pending interaction", () => {
  const runtime = createInteractionRuntime();
  setPendingInteraction(runtime, "hotspot", "lever");

  setPendingInteraction(runtime, "hotspot", "dog", "dog_food");

  assert.deepEqual(runtime.pendingInteraction, {
    targetType: "hotspot",
    targetId: "dog",
    itemId: "dog_food",
  });
});

test("an interaction is rejected when its captured item leaves inventory", () => {
  const hotspot = { id: "dog", approach: { x: 200, y: 300 }, effects: [] };
  const pending = { targetType: "hotspot", targetId: "dog", itemId: "dog_food" };
  const useInteraction = {
    itemId: "dog_food",
    targetType: "hotspot",
    targetId: "dog",
    effects: [],
  };

  assert.throws(() => resolvePendingInteraction(
    pending,
    scene([hotspot]),
    useInteraction,
    { inventory: [], flags: {} },
  ), /ya no está en el inventario/);
});

test("an unreachable approach does not execute effects", () => {
  const walk = createWalkModel({
    nodes: [
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 100, y: 0 },
      { id: "c", x: 500, y: 0 },
      { id: "d", x: 600, y: 0 },
    ],
    paths: [
      { from: "a", to: "b" },
      { from: "c", to: "d" },
    ],
  });
  const state = { inventory: [], flags: { on: false } };

  assert.throws(() => calculateHotspotApproachRoute(
    walk,
    { x: 50, y: 0 },
    { id: "switch", approach: { x: 550, y: 0 } },
  ), /No existe una ruta/);
  assert.equal(state.flags.on, false);
});
