import assert from "node:assert/strict";
import test from "node:test";
import {
  createWalkModel,
  resolveActiveWalkGraph,
} from "../walk-model.js";

function validWalk() {
  return {
    nodes: [
      { id: "entrance", x: 300, y: 1400 },
      { id: "table", x: 1000, y: 1200 },
    ],
    paths: [{ from: "entrance", to: "table" }],
  };
}

test("parses walk nodes and bidirectional path segments", () => {
  const model = createWalkModel(validWalk());

  assert.deepEqual(model.nodes, [
    { id: "entrance", x: 300, y: 1400, onArrival: null },
    { id: "table", x: 1000, y: 1200, onArrival: null },
  ]);
  assert.deepEqual(model.paths, [{ from: "entrance", to: "table", enabledWhen: null }]);
  assert.equal(model.segments[0].from, "entrance");
  assert.equal(model.segments[0].to, "table");
  assert.equal(model.segments[0].length, Math.hypot(700, -200));
});

test("parses a valid node on_arrival with optional runtime condition", () => {
  const walk = validWalk();
  walk.nodes[1].on_arrival = {
    enabled_when: { flag: "blocked", value: true },
    effects: [{ start_dialogue: "cannot_pass" }],
  };
  const model = createWalkModel(
    walk,
    { inventory: [], flags: { blocked: true } },
    [{ id: "cannot_pass", lines: [] }],
  );
  assert.deepEqual(model.nodes[1].onArrival, {
    enabledWhen: { flag: "blocked", value: true },
    actions: [{ type: "start_dialogue", dialogueId: "cannot_pass" }],
  });
});

test("node on_arrival validates flags, actions, and dialogue references", () => {
  const unknownFlag = validWalk();
  unknownFlag.nodes[0].on_arrival = {
    enabled_when: { flag: "missing", value: true },
    effects: [{ set_flag: "blocked" }],
  };
  assert.throws(
    () => createWalkModel(unknownFlag, { flags: { blocked: false } }),
    /flag no declarado: missing/,
  );

  const invalidAction = validWalk();
  invalidAction.nodes[0].on_arrival = { effects: [{ teleport: "somewhere" }] };
  assert.throws(
    () => createWalkModel(invalidAction, { flags: {} }),
    /debe usar set_flag/,
  );

  const missingDialogue = validWalk();
  missingDialogue.nodes[0].on_arrival = { effects: [{ start_dialogue: "missing" }] };
  assert.throws(
    () => createWalkModel(missingDialogue, { flags: {} }, []),
    /diálogo inexistente: missing/,
  );
});

test("parses optional enabled_when and resolves true, false, and value false", () => {
  const walk = validWalk();
  walk.paths[0].enabled_when = { flag: "door_open", value: true };
  const state = { flags: { door_open: false } };
  const model = createWalkModel(walk, state);

  assert.deepEqual(model.paths[0].enabledWhen, { flag: "door_open", value: true });
  assert.equal(resolveActiveWalkGraph(model, state).segments.length, 0);
  state.flags.door_open = true;
  assert.equal(resolveActiveWalkGraph(model, state).segments.length, 1);

  walk.paths[0].enabled_when.value = false;
  const inverse = createWalkModel(walk, state);
  assert.equal(resolveActiveWalkGraph(inverse, state).segments.length, 0);
  state.flags.door_open = false;
  assert.equal(resolveActiveWalkGraph(inverse, state).segments.length, 1);
});

test("rejects an unknown flag and non-boolean path condition", () => {
  const missing = validWalk();
  missing.paths[0].enabled_when = { flag: "missing", value: true };
  assert.throws(
    () => createWalkModel(missing, { flags: {} }),
    /flag no declarado: missing/,
  );
  const invalid = validWalk();
  invalid.paths[0].enabled_when = { flag: "door_open", value: "yes" };
  assert.throws(
    () => createWalkModel(invalid, { flags: { door_open: false } }),
    /value debe ser true o false/,
  );
});

test("rejects duplicate walk node ids", () => {
  const walk = validWalk();
  walk.nodes.push({ id: "entrance", x: 500, y: 500 });
  assert.throws(() => createWalkModel(walk), /id duplicado: entrance/);
});

test("rejects paths that refer to missing nodes", () => {
  const walk = validWalk();
  walk.paths[0].to = "missing";
  assert.throws(() => createWalkModel(walk), /nodo inexistente: missing/);
});

test("rejects invalid walk node coordinates", () => {
  const walk = validWalk();
  walk.nodes[0].x = -1;
  assert.throws(() => createWalkModel(walk), /walk\.nodes\[0\]\.x debe ser/);
});

test("rejects duplicate bidirectional connections", () => {
  const walk = validWalk();
  walk.paths.push({ from: "table", to: "entrance" });
  assert.throws(() => createWalkModel(walk), /duplica la conexión/);
});
