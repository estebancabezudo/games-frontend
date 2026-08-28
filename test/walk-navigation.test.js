import assert from "node:assert/strict";
import test from "node:test";
import { canvasPointToWorld, screenPointToWorldLogical } from "../scene-coordinates.js";
import { createWalkModel } from "../walk-model.js";
import {
  arrivalNodeIdForProjection,
  calculateWalkNavigation,
  calculateWalkRoute,
  projectPointToSegment,
  projectPointToWalkGraph,
} from "../walk-navigation.js";
import { setCharacterRoute } from "../character-runtime.js";

function segment(start, end) {
  return {
    from: "a",
    to: "b",
    start,
    end,
    length: Math.hypot(end.x - start.x, end.y - start.y),
  };
}

function linearWalk() {
  return createWalkModel({
    nodes: [
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 10, y: 0 },
      { id: "c", x: 20, y: 0 },
    ],
    paths: [
      { from: "a", to: "b" },
      { from: "b", to: "c" },
    ],
  });
}

test("projects onto horizontal, vertical, and diagonal segments", () => {
  assert.deepEqual(
    projectPointToSegment({ x: 4, y: 3 }, segment({ x: 0, y: 0 }, { x: 10, y: 0 })).point,
    { x: 4, y: 0 },
  );
  assert.deepEqual(
    projectPointToSegment({ x: 3, y: 4 }, segment({ x: 0, y: 0 }, { x: 0, y: 10 })).point,
    { x: 0, y: 4 },
  );
  assert.deepEqual(
    projectPointToSegment({ x: 8, y: 2 }, segment({ x: 0, y: 0 }, { x: 10, y: 10 })).point,
    { x: 5, y: 5 },
  );
});

test("selects the nearest walk segment", () => {
  const walk = createWalkModel({
    nodes: [
      { id: "top_left", x: 0, y: 0 },
      { id: "top_right", x: 10, y: 0 },
      { id: "bottom_left", x: 0, y: 20 },
      { id: "bottom_right", x: 10, y: 20 },
    ],
    paths: [
      { from: "top_left", to: "top_right" },
      { from: "bottom_left", to: "bottom_right" },
    ],
  });

  const projection = projectPointToWalkGraph({ x: 5, y: 17 }, walk);
  assert.equal(projection.segment.from, "bottom_left");
  assert.deepEqual(projection.point, { x: 5, y: 20 });
  assert.equal(projection.distance, 3);
});

test("uses a direct route when origin and destination share a segment", () => {
  assert.deepEqual(calculateWalkRoute(linearWalk(), { x: 2, y: 4 }, { x: 8, y: -3 }), [
    { x: 2, y: 0 },
    { x: 8, y: 0 },
  ]);
});

test("calculates a simple route from middle to middle", () => {
  assert.deepEqual(calculateWalkRoute(linearWalk(), { x: 5, y: 2 }, { x: 15, y: 3 }), [
    { x: 5, y: 0 },
    { x: 10, y: 0 },
    { x: 15, y: 0 },
  ]);
});

test("chooses the shortest route among multiple graph alternatives", () => {
  const walk = createWalkModel({
    nodes: [
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 10, y: 0 },
      { id: "c", x: 0, y: 20 },
      { id: "d", x: 20, y: 0 },
    ],
    paths: [
      { from: "a", to: "b" },
      { from: "b", to: "d" },
      { from: "a", to: "c" },
      { from: "c", to: "d" },
    ],
  });

  assert.deepEqual(calculateWalkRoute(walk, { x: 0, y: 0 }, { x: 20, y: 0 }), [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 20, y: 0 },
  ]);
});

test("camera displacement does not alter world navigation", () => {
  const destination = screenPointToWorldLogical({ x: 5, y: 0 }, 10);
  assert.deepEqual(calculateWalkRoute(linearWalk(), { x: 5, y: 0 }, destination), [
    { x: 5, y: 0 },
    { x: 10, y: 0 },
    { x: 15, y: 0 },
  ]);
});

test("portrait and landscape canvas conversions produce world route destinations", () => {
  const walk = createWalkModel({
    nodes: [
      { id: "left", x: 0, y: 500 },
      { id: "right", x: 3000, y: 500 },
    ],
    paths: [{ from: "left", to: "right" }],
  });
  const portraitWorld = canvasPointToWorld(
    { x: 225, y: 400 },
    { width: 450, height: 800 },
    { width: 1080, height: 1920 },
    500,
    { width: 3000, height: 1920 },
  );
  const landscapeWorld = canvasPointToWorld(
    { x: 400, y: 225 },
    { width: 800, height: 450 },
    { width: 1920, height: 1080 },
    500,
    { width: 3000, height: 1080 },
  );

  assert.deepEqual(projectPointToWalkGraph(portraitWorld, walk).point, { x: 1040, y: 500 });
  assert.deepEqual(projectPointToWalkGraph(landscapeWorld, walk).point, { x: 1460, y: 500 });
});

function gatedWalk(state) {
  return createWalkModel({
    nodes: [
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 10, y: 0 },
      { id: "c", x: 20, y: 0 },
    ],
    paths: [
      { from: "a", to: "b" },
      {
        from: "b",
        to: "c",
        enabled_when: { flag: "gate_open", value: true },
      },
    ],
  }, state);
}

test("a disabled path participates in neither projection nor player routing", () => {
  const state = { flags: { gate_open: false } };
  const walk = gatedWalk(state);
  assert.deepEqual(projectPointToWalkGraph({ x: 20, y: 0 }, walk, state).point, { x: 10, y: 0 });
  assert.deepEqual(calculateWalkRoute(walk, { x: 0, y: 0 }, { x: 20, y: 0 }, state), [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
  ]);
});

test("changing a flag enables projection and a new Dijkstra route without reparsing", () => {
  const state = { flags: { gate_open: false } };
  const walk = gatedWalk(state);
  const declaredSegments = walk.segments.length;
  state.flags.gate_open = true;
  assert.deepEqual(projectPointToWalkGraph({ x: 20, y: 0 }, walk, state).point, { x: 20, y: 0 });
  assert.deepEqual(calculateWalkRoute(walk, { x: 0, y: 0 }, { x: 20, y: 0 }, state), [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 20, y: 0 },
  ]);
  assert.equal(walk.segments.length, declaredSegments);
});

test("Dijkstra cannot cross a disabled connection between enabled segments", () => {
  const state = { flags: { gate_open: false } };
  const walk = createWalkModel({
    nodes: [
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 10, y: 0 },
      { id: "c", x: 20, y: 0 },
      { id: "d", x: 30, y: 0 },
    ],
    paths: [
      { from: "a", to: "b" },
      { from: "b", to: "c", enabled_when: { flag: "gate_open", value: true } },
      { from: "c", to: "d" },
    ],
  }, state);
  assert.throws(
    () => calculateWalkRoute(walk, { x: 0, y: 0 }, { x: 30, y: 0 }, state),
    /No existe una ruta/,
  );
});

test("a route already stored in runtime is not changed retroactively", () => {
  const state = { flags: { gate_open: true } };
  const walk = gatedWalk(state);
  const route = calculateWalkRoute(walk, { x: 0, y: 0 }, { x: 20, y: 0 }, state);
  const runtime = {
    position: { x: 0, y: 0 },
    route: [],
    destination: null,
    motion: "idle",
    bounds: null,
  };
  setCharacterRoute(runtime, route, { width: 30, height: 10 });
  state.flags.gate_open = false;
  assert.deepEqual(runtime.route, [{ x: 10, y: 0 }, { x: 20, y: 0 }]);
});

test("navigation identifies final nodes but not destinations inside a segment", () => {
  const walk = linearWalk();
  assert.equal(
    calculateWalkNavigation(walk, { x: 2, y: 0 }, { x: 5, y: 0 }).arrivalNodeId,
    null,
  );
  assert.equal(
    calculateWalkNavigation(walk, { x: 5, y: 0 }, { x: -10, y: 0 }).arrivalNodeId,
    "a",
  );
  assert.equal(
    calculateWalkNavigation(walk, { x: 5, y: 0 }, { x: 30, y: 0 }).arrivalNodeId,
    "c",
  );
});

test("arrival node endpoint detection uses numeric tolerance", () => {
  const edge = segment({ x: 0, y: 0 }, { x: 10, y: 0 });
  assert.equal(arrivalNodeIdForProjection({ segment: edge, progress: 0.0000005 }), "a");
  assert.equal(arrivalNodeIdForProjection({ segment: edge, progress: 0.9999995 }), "b");
  assert.equal(arrivalNodeIdForProjection({ segment: edge, progress: 0.5 }), null);
});

test("an intermediate node is not reported as the free-navigation arrival", () => {
  const navigation = calculateWalkNavigation(
    linearWalk(),
    { x: 0, y: 0 },
    { x: 20, y: 0 },
  );
  assert.deepEqual(navigation.route, [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 20, y: 0 },
  ]);
  assert.equal(navigation.arrivalNodeId, "c");
});

test("a new intention at the node still reports immediate arrival", () => {
  const state = { flags: { gate_open: false } };
  const walk = gatedWalk(state);
  const navigation = calculateWalkNavigation(
    walk,
    { x: 10, y: 0 },
    { x: 20, y: 0 },
    state,
  );
  assert.equal(navigation.arrivalNodeId, "b");
  assert.deepEqual(navigation.route, [{ x: 10, y: 0 }]);
});

test("enabling the next path changes the final node and makes the blocked node intermediate", () => {
  const state = { flags: { gate_open: false } };
  const walk = gatedWalk(state);
  assert.equal(
    calculateWalkNavigation(walk, { x: 0, y: 0 }, { x: 20, y: 0 }, state).arrivalNodeId,
    "b",
  );
  state.flags.gate_open = true;
  const navigation = calculateWalkNavigation(walk, { x: 0, y: 0 }, { x: 20, y: 0 }, state);
  assert.equal(navigation.arrivalNodeId, "c");
  assert.deepEqual(navigation.route[1], { x: 10, y: 0 });
});
