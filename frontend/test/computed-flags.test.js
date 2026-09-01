import assert from "node:assert/strict";
import test from "node:test";
import { resolveSceneElementVariant } from "../element-variants.js";
import { createFlagCondition, matchesFlagCondition } from "../flag-condition.js";
import { applyFlagEffects, createFlagEffects } from "../flag-effects.js";
import { copyFlagsState, flagDefinition } from "../flag-state.js";
import { applyGameActions, createGameActions } from "../game-actions.js";
import { createGameState } from "../game-state.js";
import { hotspotIsEnabled } from "../hotspot-availability.js";
import { createSceneModel } from "../scene-model.js";

function stateWith(flags) {
  return createGameState({ items: [], state: { inventory: [], flags } }, []);
}

test("legacy boolean flags remain mutable and observable as booleans", () => {
  const state = stateWith({ light_on: false, door_open: true });
  assert.deepEqual(state.flags, { light_on: false, door_open: true });

  applyFlagEffects(
    state,
    createFlagEffects([{ toggle_flag: "light_on" }], state, "effects"),
  );
  assert.deepEqual(state.flags, { light_on: true, door_open: true });
});

test("and evaluates true and false and normalizes extra spaces", () => {
  const state = stateWith({
    first: true,
    second: true,
    both: "  first   and   second  ",
    disabled: false,
    not_both: "first and disabled",
  });
  assert.equal(state.flags.both, true);
  assert.equal(state.flags.not_both, false);
  assert.deepEqual(flagDefinition(state, "both"), {
    type: "computed",
    left: "first",
    operator: "and",
    right: "second",
  });
});

test("or evaluates true and false", () => {
  const state = stateWith({
    first: false,
    second: true,
    either: "first or second",
    third: false,
    neither: "first or third",
  });
  assert.equal(state.flags.either, true);
  assert.equal(state.flags.neither, false);
});

test("a computed flag may depend on an earlier computed flag", () => {
  const state = stateWith({
    electricity: true,
    switch_on: true,
    light_on: "electricity and switch_on",
    room_ready: "light_on and electricity",
  });
  assert.equal(state.flags.light_on, true);
  assert.equal(state.flags.room_ready, true);
});

test("changing a mutable operand immediately updates every dependent flag", () => {
  const state = stateWith({
    electricity: true,
    switch_on: false,
    light_on: "electricity and switch_on",
    room_ready: "light_on or switch_on",
  });
  assert.equal(state.flags.light_on, false);
  assert.equal(state.flags.room_ready, false);

  applyFlagEffects(state, [{ type: "set_flag", flag: "switch_on" }]);
  assert.equal(state.flags.light_on, true);
  assert.equal(state.flags.room_ready, true);
});

test("conditions and hotspot availability consume computed booleans transparently", () => {
  const state = stateWith({
    electricity: true,
    switch_on: false,
    light_on: "electricity and switch_on",
  });
  const condition = createFlagCondition(
    { flag: "light_on", value: true },
    state,
    "enabled_when",
  );
  const hotspot = { enabledWhen: condition };
  assert.equal(matchesFlagCondition(condition, state), false);
  assert.equal(hotspotIsEnabled(hotspot, state), false);

  state.flags.switch_on = true;
  assert.equal(matchesFlagCondition(condition, state), true);
  assert.equal(hotspotIsEnabled(hotspot, state), true);
});

test("element variants consume a computed flag transparently", () => {
  const state = stateWith({
    electricity: true,
    switch_on: false,
    light_on: "electricity and switch_on",
  });
  const model = createSceneModel({
    game: { id: "example" },
    scene: { id: "room" },
    viewport: { orientation: "portrait" },
    size: { width: 1080, height: 1920 },
    background: { color: "#dddddd" },
    elements: [{
      id: "lamp",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      color: "#222222",
      variants: [{
        when: { flag: "light_on", value: true },
        color: "#ffffaa",
      }],
    }],
  }, state);
  assert.equal(resolveSceneElementVariant(model.elements[0], state).color, "#222222");
  state.flags.switch_on = true;
  assert.equal(resolveSceneElementVariant(model.elements[0], state).color, "#ffffaa");
});

test("invalid flag values and expressions are rejected", () => {
  const invalidCases = [
    [{ value: 1 }, /debe ser true, false o una expresión/],
    [{ value: "   " }, /expresión vacía/],
    [{ value: "first and" }, /operando, operador y operando/],
    [{ value: "first xor first" }, /operador and u or en minúsculas/],
    [{ value: "first AND first" }, /operador and u or en minúsculas/],
    [{ value: "first and first or first" }, /exactamente dos operandos/],
    [{ value: "(first) and first" }, /no permite paréntesis/],
    [{ value: "true and first" }, /no permite literales booleanos/],
  ];
  invalidCases.forEach(([derived, expected]) => {
    assert.throws(() => stateWith({ first: true, derived: derived.value }), expected);
  });
});

test("missing, forward, and self references are rejected", () => {
  assert.throws(
    () => stateWith({ first: true, result: "first and missing" }),
    /declarado anteriormente: missing/,
  );
  assert.throws(
    () => stateWith({ result: "later and later", later: true }),
    /declarado anteriormente: later/,
  );
  assert.throws(
    () => stateWith({ first: true, result: "result and first" }),
    /se refiera a sí mismo: result/,
  );
});

test("model validation rejects every direct action on a computed flag", () => {
  const state = stateWith({ first: true, second: false, result: "first or second" });
  for (const type of ["set_flag", "clear_flag", "toggle_flag"]) {
    assert.throws(
      () => createFlagEffects([{ [type]: "result" }], state, "effects"),
      new RegExp(`${type}.*flag calculado: result`),
    );
  }
});

test("runtime rejects an unvalidated direct action on a computed flag", () => {
  const state = stateWith({ first: true, second: false, result: "first or second" });
  assert.throws(
    () => applyFlagEffects(state, [{ type: "toggle_flag", flag: "result" }]),
    /toggle_flag.*flag calculado: result/,
  );
  assert.equal(state.flags.result, true);
});

test("sequential game actions expose updated computed values to later callbacks", () => {
  const state = stateWith({
    electricity_on: true,
    light_switch_on: false,
    light_on: "electricity_on and light_switch_on",
  });
  const observed = [];
  const actions = createGameActions(
    [
      { set_flag: "light_switch_on" },
      { start_dialogue: "status" },
    ],
    state,
    [{ id: "status", lines: [] }],
  );
  applyGameActions(state, actions, {
    startDialogue() {
      observed.push(state.flags.light_on);
    },
  });
  assert.deepEqual(observed, [true]);
});

test("computed flags do not mutate YAML definitions", () => {
  const document = {
    items: [],
    state: {
      inventory: [],
      flags: {
        electricity_on: true,
        light_switch_on: false,
        light_on: "electricity_on and light_switch_on",
      },
    },
  };
  const before = structuredClone(document);
  const state = createGameState(document, []);
  state.flags.light_switch_on = true;

  assert.deepEqual(document, before);
  assert.equal(state.flags.light_on, true);
});

test("copyFlagsState preserves definitions, dependency order, and independence", () => {
  const original = stateWith({
    first: true,
    second: false,
    either: "first or second",
    both: "either and first",
  });
  const copy = { inventory: [], flags: copyFlagsState(original.flags) };

  assert.deepEqual(flagDefinition(copy, "either"), {
    type: "computed", left: "first", operator: "or", right: "second",
  });
  assert.deepEqual(flagDefinition(copy, "both"), {
    type: "computed", left: "either", operator: "and", right: "first",
  });
  copy.flags.first = false;
  assert.equal(copy.flags.either, false);
  assert.equal(copy.flags.both, false);
  assert.equal(original.flags.first, true);
  assert.equal(original.flags.either, true);
  assert.equal(original.flags.both, true);
});
