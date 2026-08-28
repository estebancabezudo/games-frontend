import assert from "node:assert/strict";
import test from "node:test";
import { resolveSceneElementVariant } from "../element-variants.js";
import { applyFlagEffects, createFlagEffects } from "../flag-effects.js";
import { createSceneModel } from "../scene-model.js";
import { orderSceneElements } from "../scene-renderer.js";

function createState(flagValue) {
  return { inventory: [], flags: { lever_on: flagValue } };
}

function createDocument(variants) {
  const element = {
    id: "lever",
    x: 400,
    y: 600,
    width: 100,
    height: 200,
    color: "#888888",
  };
  if (variants !== undefined) {
    element.variants = variants;
  }

  return {
    game: { id: "example" },
    scene: { id: "room" },
    viewport: { orientation: "portrait" },
    size: { width: 1080, height: 1920 },
    background: { color: "#dddddd" },
    elements: [element],
  };
}

function createElement(variants, state) {
  return createSceneModel(createDocument(variants), state).elements[0];
}

test("an element without variants keeps its base appearance", () => {
  const state = createState(false);
  const element = createElement(undefined, state);

  assert.deepEqual(element.variants, []);
  assert.strictEqual(resolveSceneElementVariant(element, state), element);
});

test("resolves a variant whose flag is true", () => {
  const state = createState(true);
  const element = createElement([{
    when: { flag: "lever_on", value: true },
    color: "#44aa44",
  }], state);

  assert.equal(resolveSceneElementVariant(element, state).color, "#44aa44");
});

test("resolves a variant whose flag is false", () => {
  const state = createState(false);
  const element = createElement([{
    when: { flag: "lever_on", value: false },
    color: "#aa4444",
  }], state);

  assert.equal(resolveSceneElementVariant(element, state).color, "#aa4444");
});

test("uses the base appearance when no variant is active", () => {
  const state = createState(false);
  const element = createElement([{
    when: { flag: "lever_on", value: true },
    color: "#44aa44",
  }], state);

  assert.strictEqual(resolveSceneElementVariant(element, state), element);
  assert.equal(element.color, "#888888");
});

test("rejects a variant that refers to an undeclared flag", () => {
  assert.throws(
    () => createElement([{
      when: { flag: "missing", value: true },
      color: "#44aa44",
    }], createState(false)),
    /refiere a un flag no declarado: missing/,
  );
});

test("rejects a non-boolean variant condition value", () => {
  assert.throws(
    () => createElement([{
      when: { flag: "lever_on", value: "true" },
      color: "#44aa44",
    }], createState(false)),
    /variants\[0\]\.when\.value debe ser true o false/,
  );
});

test("a variant only overwrites its declared properties", () => {
  const state = createState(true);
  const element = createElement([{
    when: { flag: "lever_on", value: true },
    color: "#44aa44",
  }], state);
  const resolved = resolveSceneElementVariant(element, state);

  assert.equal(resolved.id, "lever");
  assert.equal(resolved.x, 400);
  assert.equal(resolved.y, 600);
  assert.equal(resolved.width, 100);
  assert.equal(resolved.height, 200);
  assert.equal(resolved.color, "#44aa44");
});

test("toggle_flag updates the active variant", () => {
  const state = createState(false);
  const element = createElement([{
    when: { flag: "lever_on", value: true },
    color: "#44aa44",
  }], state);
  const effects = createFlagEffects(
    [{ toggle_flag: "lever_on" }],
    state,
    "effects",
  );

  assert.equal(resolveSceneElementVariant(element, state).color, "#888888");
  applyFlagEffects(state, effects);
  assert.equal(resolveSceneElementVariant(element, state).color, "#44aa44");
  applyFlagEffects(state, effects);
  assert.equal(resolveSceneElementVariant(element, state).color, "#888888");
});

test("rejects more than one active variant", () => {
  assert.throws(
    () => createElement([
      {
        when: { flag: "lever_on", value: true },
        color: "#44aa44",
      },
      {
        when: { flag: "lever_on", value: true },
        width: 120,
      },
    ], createState(true)),
    /El elemento lever tiene más de una variante activa/,
  );
});

test("a variant can overwrite z", () => {
  const state = createState(true);
  const element = createElement([{
    when: { flag: "lever_on", value: true },
    z: 20,
  }], state);

  assert.equal(resolveSceneElementVariant(element, state).z, 20);
});

test("a variant validates z like the base element", () => {
  assert.throws(
    () => createElement([{
      when: { flag: "lever_on", value: true },
      z: 1.5,
    }], createState(true)),
    /variants\[0\]\.z debe ser un número entero/,
  );
});

test("toggle_flag changes both asset and z in the active variant", () => {
  const state = createState(false);
  const element = createElement([{
    when: { flag: "lever_on", value: true },
    asset: "assets/lever-down.svg",
    z: 5,
  }], state);
  const effects = createFlagEffects(
    [{ toggle_flag: "lever_on" }],
    state,
    "effects",
  );

  assert.equal(resolveSceneElementVariant(element, state).z, 0);
  assert.equal(resolveSceneElementVariant(element, state).asset, null);
  applyFlagEffects(state, effects);
  assert.equal(resolveSceneElementVariant(element, state).z, 5);
  assert.equal(resolveSceneElementVariant(element, state).asset, "assets/lever-down.svg");
});

test("resolved variant z changes the final render order", () => {
  const state = createState(false);
  const element = createElement([{
    when: { flag: "lever_on", value: true },
    z: 5,
  }], state);
  element.z = 20;
  const fixedElement = { id: "table", z: 10 };
  const effects = createFlagEffects(
    [{ toggle_flag: "lever_on" }],
    state,
    "effects",
  );

  assert.deepEqual(
    orderSceneElements([resolveSceneElementVariant(element, state), fixedElement])
      .map(({ id }) => id),
    ["table", "lever"],
  );
  applyFlagEffects(state, effects);
  assert.deepEqual(
    orderSceneElements([resolveSceneElementVariant(element, state), fixedElement])
      .map(({ id }) => id),
    ["lever", "table"],
  );
});
