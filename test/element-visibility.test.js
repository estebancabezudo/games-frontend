import assert from "node:assert/strict";
import test from "node:test";
import { isSceneElementVisible } from "../element-visibility.js";
import { applyFlagEffects, createFlagEffects } from "../flag-effects.js";
import { createSceneModel } from "../scene-model.js";

function createState(lightOn) {
  return { inventory: [], flags: { light_on: lightOn } };
}

function createDocument(visibleWhen) {
  const element = {
    id: "dark_overlay",
    x: 0,
    y: 0,
    width: 1080,
    height: 1920,
    color: "#000000",
  };
  if (visibleWhen !== undefined) {
    element.visible_when = visibleWhen;
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

test("an element without visible_when is always visible", () => {
  const state = createState(false);
  const element = createSceneModel(createDocument(), state).elements[0];

  assert.equal(element.visibleWhen, null);
  assert.equal(isSceneElementVisible(element, state), true);
});

test("a true flag shows an element that expects true", () => {
  const state = createState(true);
  const element = createSceneModel(createDocument({
    flag: "light_on",
    value: true,
  }), state).elements[0];

  assert.equal(isSceneElementVisible(element, state), true);
});

test("a false flag hides an element that expects true", () => {
  const state = createState(false);
  const element = createSceneModel(createDocument({
    flag: "light_on",
    value: true,
  }), state).elements[0];

  assert.equal(isSceneElementVisible(element, state), false);
});

test("value false shows an element while its flag is false", () => {
  const state = createState(false);
  const element = createSceneModel(createDocument({
    flag: "light_on",
    value: false,
  }), state).elements[0];

  assert.equal(isSceneElementVisible(element, state), true);
});

test("visible_when rejects an undeclared flag", () => {
  assert.throws(
    () => createSceneModel(createDocument({
      flag: "missing",
      value: true,
    }), createState(false)),
    /refiere a un flag no declarado: missing/,
  );
});

test("visible_when rejects a non-boolean value", () => {
  assert.throws(
    () => createSceneModel(createDocument({
      flag: "light_on",
      value: "false",
    }), createState(false)),
    /visible_when\.value debe ser true o false/,
  );
});

test("toggle_flag changes the visibility decision", () => {
  const state = createState(false);
  const element = createSceneModel(createDocument({
    flag: "light_on",
    value: false,
  }), state).elements[0];
  const effects = createFlagEffects(
    [{ toggle_flag: "light_on" }],
    state,
    "effects",
  );

  assert.equal(isSceneElementVisible(element, state), true);
  applyFlagEffects(state, effects);
  assert.equal(isSceneElementVisible(element, state), false);
});
