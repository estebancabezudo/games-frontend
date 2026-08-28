import assert from "node:assert/strict";
import test from "node:test";
import { applyGameActions } from "../game-actions.js";
import { calculateActorApproachRoute } from "../actor-interaction.js";
import { requestNextPatrolRoute } from "../actor-patrol.js";
import { createActorsRuntime } from "../actors-runtime.js";
import { calculateHotspotApproachRoute } from "../hotspot-interaction.js";
import { createWalkModel } from "../walk-model.js";
import {
  cancelPendingWalkArrival,
  createWalkArrivalRuntime,
  resolveWalkArrival,
  setPendingWalkArrival,
  takePendingWalkArrival,
} from "../walk-arrival-runtime.js";

function walk(onArrival) {
  return {
    nodes: [
      { id: "a", x: 0, y: 0, onArrival: null },
      { id: "b", x: 10, y: 0, onArrival },
    ],
  };
}

test("a node without on_arrival resolves no actions", () => {
  assert.deepEqual(
    resolveWalkArrival({ nodeId: "a" }, walk(null), { flags: {} }),
    { nodeId: "a", actions: [] },
  );
});

test("enabled_when is evaluated at real arrival time", () => {
  const state = { flags: { blocked: true } };
  const model = walk({
    enabledWhen: { flag: "blocked", value: true },
    actions: [{ type: "set_flag", flag: "arrived" }],
  });
  state.flags.blocked = false;
  assert.deepEqual(resolveWalkArrival({ nodeId: "b" }, model, state).actions, []);
  state.flags.blocked = true;
  assert.equal(resolveWalkArrival({ nodeId: "b" }, model, state).actions.length, 1);
});

test("final node actions use the common sequential game action executor", () => {
  const state = { inventory: [], flags: { blocked: true, arrived: false } };
  const actions = [
    { type: "set_flag", flag: "arrived" },
    { type: "start_dialogue", dialogueId: "cannot_pass" },
  ];
  const arrival = resolveWalkArrival(
    { nodeId: "b" },
    walk({ enabledWhen: null, actions }),
    state,
  );
  const observed = [];
  applyGameActions(state, arrival.actions, {
    startDialogue(id) { observed.push([id, state.flags.arrived]); },
  });
  assert.deepEqual(observed, [["cannot_pass", true]]);
});

test("new free navigation replaces and interaction-style cancellation clears pending arrival", () => {
  const runtime = createWalkArrivalRuntime();
  setPendingWalkArrival(runtime, "a");
  setPendingWalkArrival(runtime, "b");
  assert.deepEqual(runtime.pendingWalkArrival, { nodeId: "b" });
  cancelPendingWalkArrival(runtime);
  assert.equal(runtime.pendingWalkArrival, null);
});

test("taking pending arrival clears it before actions such as dialogue begin", () => {
  const runtime = createWalkArrivalRuntime();
  setPendingWalkArrival(runtime, "b");
  assert.deepEqual(takePendingWalkArrival(runtime), { nodeId: "b" });
  assert.equal(runtime.pendingWalkArrival, null);
});

test("a missing runtime node produces a clear error", () => {
  assert.throws(
    () => resolveWalkArrival({ nodeId: "missing" }, walk(null), { flags: {} }),
    /nodo de llegada missing ya no existe/,
  );
});

test("patrol and hotspot or actor approaches do not execute node on_arrival", () => {
  const state = { inventory: [], flags: { arrived: false } };
  const model = createWalkModel({
    nodes: [
      { id: "a", x: 0, y: 0 },
      {
        id: "b",
        x: 10,
        y: 0,
        on_arrival: { effects: [{ set_flag: "arrived" }] },
      },
      { id: "c", x: 20, y: 0 },
    ],
    paths: [
      { from: "a", to: "b" },
      { from: "b", to: "c" },
    ],
  }, state);

  calculateHotspotApproachRoute(
    model,
    { x: 0, y: 0 },
    { id: "switch", approach: { x: 10, y: 0 } },
    state,
  );
  calculateActorApproachRoute(
    model,
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    0,
    state,
  );
  const dog = {
    id: "dog",
    visual: { directions: 1 },
    position: { x: 0, y: 0 },
    size: { width: 1, height: 1 },
    interactions: null,
    movement: {
      type: "patrol",
      enabledWhen: null,
      points: [{ x: 10, y: 0 }, { x: 20, y: 0 }],
    },
  };
  requestNextPatrolRoute(
    dog,
    createActorsRuntime([dog]).dog,
    model,
    { width: 30, height: 10 },
    state,
  );

  assert.equal(state.flags.arrived, false);
});
