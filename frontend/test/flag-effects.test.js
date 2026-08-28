import assert from "node:assert/strict";
import test from "node:test";
import { applyFlagEffects, createFlagEffects } from "../flag-effects.js";

function stateWithFlag(value) {
  return { inventory: [], flags: { light_on: value } };
}

test("set_flag sets a declared flag to true", () => {
  const state = stateWithFlag(false);
  const effects = createFlagEffects([{ set_flag: "light_on" }], state, "effects");

  applyFlagEffects(state, effects);

  assert.deepEqual(effects, [{ type: "set_flag", flag: "light_on" }]);
  assert.equal(state.flags.light_on, true);
});

test("clear_flag sets a declared flag to false", () => {
  const state = stateWithFlag(true);
  const effects = createFlagEffects([{ clear_flag: "light_on" }], state, "effects");

  applyFlagEffects(state, effects);

  assert.deepEqual(effects, [{ type: "clear_flag", flag: "light_on" }]);
  assert.equal(state.flags.light_on, false);
});

test("toggle_flag inverts a declared flag", () => {
  const state = stateWithFlag(false);
  const effects = createFlagEffects([{ toggle_flag: "light_on" }], state, "effects");

  applyFlagEffects(state, effects);

  assert.deepEqual(effects, [{ type: "toggle_flag", flag: "light_on" }]);
  assert.equal(state.flags.light_on, true);
});

test("rejects an effect that refers to an undeclared flag", () => {
  assert.throws(
    () => createFlagEffects(
      [{ set_flag: "missing" }],
      stateWithFlag(false),
      "effects",
    ),
    /refiere a un flag no declarado: missing/,
  );
});

test("executes two effects in declaration order", () => {
  const state = stateWithFlag(true);
  const effects = createFlagEffects([
    { clear_flag: "light_on" },
    { toggle_flag: "light_on" },
  ], state, "effects");

  applyFlagEffects(state, effects);

  assert.equal(state.flags.light_on, true);
});

test("rejects an empty effect list", () => {
  assert.throws(
    () => createFlagEffects([], stateWithFlag(false), "effects"),
    /debe contener uno o más efectos/,
  );
});
