import assert from "node:assert/strict";
import test from "node:test";
import { resolveSceneElementVariant } from "../element-variants.js";
import { applyFlagEffects, createFlagEffects } from "../flag-effects.js";
import { createSceneModel } from "../scene-model.js";
import { resolveSvgAssetUrl } from "../svg-asset.js";

function createState(leverOn = false) {
  return { inventory: [], flags: { lever_on: leverOn } };
}

function createDocument(visualProperties, variants) {
  const element = {
    id: "lever",
    x: 400,
    y: 600,
    width: 100,
    height: 200,
    ...visualProperties,
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

function createElement(visualProperties, variants, state = createState()) {
  return createSceneModel(
    createDocument(visualProperties, variants),
    state,
  ).elements[0];
}

test("creates an element represented by color", () => {
  const element = createElement({ color: "#888888" });

  assert.equal(element.color, "#888888");
  assert.equal(element.asset, null);
});

test("creates an element represented by an SVG asset", () => {
  const element = createElement({ asset: "assets/lever-up.svg" });

  assert.equal(element.color, null);
  assert.equal(element.asset, "assets/lever-up.svg");
  assert.equal(
    resolveSvgAssetUrl(element.asset, "http://example.test/games/"),
    "http://example.test/games/assets/lever-up.svg",
  );
});

test("rejects an element with both color and asset", () => {
  assert.throws(
    () => createElement({
      color: "#888888",
      asset: "assets/lever-up.svg",
    }),
    /no puede declarar color y asset al mismo tiempo/,
  );
});

test("rejects an element without color or asset", () => {
  assert.throws(
    () => createElement({}),
    /debe declarar color o asset/,
  );
});

test("a variant replaces the active SVG asset", () => {
  const state = createState(true);
  const element = createElement(
    { asset: "assets/lever-up.svg" },
    [{
      when: { flag: "lever_on", value: true },
      asset: "assets/lever-down.svg",
    }],
    state,
  );

  assert.equal(
    resolveSceneElementVariant(element, state).asset,
    "assets/lever-down.svg",
  );
});

test("toggle_flag changes and restores the active SVG asset", () => {
  const state = createState(false);
  const element = createElement(
    { asset: "assets/lever-up.svg" },
    [{
      when: { flag: "lever_on", value: true },
      asset: "assets/lever-down.svg",
    }],
    state,
  );
  const effects = createFlagEffects(
    [{ toggle_flag: "lever_on" }],
    state,
    "effects",
  );

  assert.equal(resolveSceneElementVariant(element, state).asset, "assets/lever-up.svg");
  applyFlagEffects(state, effects);
  assert.equal(resolveSceneElementVariant(element, state).asset, "assets/lever-down.svg");
  applyFlagEffects(state, effects);
  assert.equal(resolveSceneElementVariant(element, state).asset, "assets/lever-up.svg");
});

test("rejects empty and invalid asset paths", () => {
  assert.throws(
    () => createElement({ asset: "" }),
    /debe ser una ruta SVG relativa al frontend/,
  );
  assert.throws(
    () => createElement({ asset: "/assets/lever-up.svg" }),
    /debe ser una ruta SVG relativa al frontend/,
  );
  assert.throws(
    () => createElement({ asset: "../lever-up.svg" }),
    /debe ser una ruta SVG relativa al frontend/,
  );
  assert.throws(
    () => createElement({ asset: "assets/lever.png" }),
    /debe ser una ruta SVG relativa al frontend/,
  );
});
