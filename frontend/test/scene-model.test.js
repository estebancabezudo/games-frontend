import assert from "node:assert/strict";
import test from "node:test";
import { applyFlagEffects } from "../flag-effects.js";
import { createGameState } from "../game-state.js";
import { createSceneModel } from "../scene-model.js";
import { fitSceneInPreview, worldRectangleToPercent } from "../scene-renderer.js";
import { parseYaml } from "../yaml-parser.js";

test("creates a portrait scene model", () => {
  const document = parseYaml(`
game:
  id: example
scene:
  id: kitchen
viewport:
  orientation: portrait
size:
  width: 1080
  height: 1920
background:
  color: "#dddddd"
items: []
state:
  inventory: []
  flags:
    light_on: false
elements:
  - id: table
    x: 100
    y: 200
    width: 300
    height: 120
    color: "#996633"
hotspots:
  - id: switch
    area:
      x: 100
      y: 400
      width: 200
      height: 100
    effects:
      - toggle_flag: light_on
`);

  assert.deepEqual(createSceneModel(document, createGameState(document)), {
    gameId: "example",
    sceneId: "kitchen",
    orientation: "portrait",
    size: { width: 1080, height: 1920 },
    backgroundColor: "#dddddd",
    depthScale: null,
    actors: [],
    controlledActorId: null,
    character: null,
    dialogues: [],
    items: [],
    walk: null,
    elements: [{
      id: "table",
      x: 100,
      y: 200,
      width: 300,
      height: 120,
      z: 0,
      depthY: null,
      color: "#996633",
      asset: null,
      visibleWhen: null,
      variants: [],
    }],
    hotspots: [{
      id: "switch",
      enabledWhen: null,
      area: { x: 100, y: 400, width: 200, height: 100 },
      approach: null,
      effects: [{ type: "toggle_flag", flag: "light_on" }],
    }],
    objects: [],
    useInteraction: null,
  });
});

test("creates a landscape scene model", () => {
  const document = parseYaml(`
game:
  id: example
scene:
  id: garden
viewport:
  orientation: landscape
size:
  width: 1920
  height: 1080
background:
  color: "#b7d8a8"
`);

  assert.deepEqual(createSceneModel(document), {
    gameId: "example",
    sceneId: "garden",
    orientation: "landscape",
    size: { width: 1920, height: 1080 },
    backgroundColor: "#b7d8a8",
    depthScale: null,
    actors: [],
    controlledActorId: null,
    character: null,
    dialogues: [],
    items: [],
    walk: null,
    elements: [],
    hotspots: [],
    objects: [],
    useInteraction: null,
  });
});

test("creates a hotspot without a direct action for an item interaction", () => {
  const model = createSceneModel({
    game: { id: "example" },
    scene: { id: "room" },
    viewport: { orientation: "portrait" },
    size: { width: 1080, height: 1920 },
    background: { color: "#dddddd" },
    hotspots: [{
      id: "dog",
      area: { x: 600, y: 900, width: 300, height: 300 },
    }],
  });

  assert.deepEqual(model.hotspots, [{
    id: "dog",
    enabledWhen: null,
    area: { x: 600, y: 900, width: 300, height: 300 },
    approach: null,
    effects: [],
  }]);
});

test("creates a hotspot approach in world coordinates", () => {
  const model = createSceneModel({
    game: { id: "example" },
    scene: { id: "room" },
    viewport: { orientation: "portrait" },
    size: { width: 1080, height: 1920 },
    background: { color: "#dddddd" },
    hotspots: [{
      id: "lever",
      area: { x: 600, y: 900, width: 100, height: 200 },
      approach: { x: 550, y: 1200 },
    }],
  });

  assert.deepEqual(model.hotspots[0].approach, { x: 550, y: 1200, facing: null });
});

test("rejects invalid hotspot approach coordinates", () => {
  assert.throws(() => createSceneModel({
    game: { id: "example" },
    scene: { id: "room" },
    viewport: { orientation: "portrait" },
    size: { width: 1080, height: 1920 },
    background: { color: "#dddddd" },
    hotspots: [{
      id: "lever",
      area: { x: 600, y: 900, width: 100, height: 200 },
      approach: { x: "near", y: 1200 },
    }],
  }), /hotspots\[0\]\.approach\.x/);
});

test("executes the common flag effect from a hotspot", () => {
  const state = { inventory: [], flags: { light_on: false } };
  const model = createSceneModel({
    game: { id: "example" },
    scene: { id: "room" },
    viewport: { orientation: "portrait" },
    size: { width: 1080, height: 1920 },
    background: { color: "#dddddd" },
    hotspots: [{
      id: "switch",
      area: { x: 100, y: 200, width: 200, height: 100 },
      effects: [{ toggle_flag: "light_on" }],
    }],
  }, state);

  applyFlagEffects(state, model.hotspots[0].effects);

  assert.equal(state.flags.light_on, true);
});

test("does not assume an orientation", () => {
  assert.throws(
    () => createSceneModel({
      game: { id: "example" },
      scene: { id: "room" },
      viewport: {},
      size: { width: 1080, height: 1920 },
      background: { color: "#dddddd" },
    }),
    /viewport\.orientation debe ser portrait o landscape/,
  );
});

test("fits a portrait scene without changing its proportion", () => {
  assert.deepEqual(
    fitSceneInPreview(
      { width: 1080, height: 1920 },
      { width: 648, height: 648 },
    ),
    { width: 337.5, height: 600, left: 155.25, top: 24 },
  );
});

test("fits a landscape scene without changing its proportion", () => {
  assert.deepEqual(
    fitSceneInPreview(
      { width: 1920, height: 1080 },
      { width: 648, height: 648 },
    ),
    { width: 600, height: 337.5, left: 24, top: 155.25 },
  );
});

test("converts portrait world coordinates to scene percentages", () => {
  const rectangle = worldRectangleToPercent(
    { x: 100, y: 200, width: 300, height: 120 },
    { width: 1080, height: 1920 },
  );

  assert.ok(Math.abs(rectangle.left - 9.259259) < 0.000001);
  assert.ok(Math.abs(rectangle.top - 10.416667) < 0.000001);
  assert.ok(Math.abs(rectangle.width - 27.777778) < 0.000001);
  assert.equal(rectangle.height, 6.25);
});

test("converts landscape world coordinates to scene percentages", () => {
  const rectangle = worldRectangleToPercent(
    { x: 100, y: 200, width: 300, height: 120 },
    { width: 1920, height: 1080 },
  );

  assert.ok(Math.abs(rectangle.left - 5.208333) < 0.000001);
  assert.ok(Math.abs(rectangle.top - 18.518519) < 0.000001);
  assert.equal(rectangle.width, 15.625);
  assert.ok(Math.abs(rectangle.height - 11.111111) < 0.000001);
});
