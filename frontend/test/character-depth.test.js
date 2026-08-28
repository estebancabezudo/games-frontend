import assert from "node:assert/strict";
import test from "node:test";
import { createSceneModel } from "../scene-model.js";
import {
  calculateCharacterScale,
  characterRenderIndex,
  compareCharacterToElement,
} from "../scene-depth.js";
import { characterRectangleToPercent } from "../scene-renderer.js";

function createDocument(characterOverrides = {}, depth) {
  const document = {
    game: { id: "example" },
    scene: { id: "room" },
    viewport: { orientation: "portrait" },
    size: { width: 1080, height: 1920 },
    background: { color: "#dddddd" },
    character: {
      id: "player",
      asset: "assets/player.svg",
      position: { x: 540, y: 1200 },
      size: { width: 180, height: 420 },
      ...characterOverrides,
    },
  };
  if (depth !== undefined) {
    document.depth = depth;
  }
  return document;
}

const depth = {
  scale: {
    near_y: 1700,
    near_scale: 1,
    far_y: 500,
    far_scale: 0.75,
  },
};

test("creates a valid static character", () => {
  const model = createSceneModel(createDocument());

  assert.deepEqual(model.character, {
    id: "player",
    visual: {
      directions: 1,
      states: {
        idle: {
          default: { type: "asset", asset: "assets/player.svg" },
        },
        walking: {
          default: { type: "asset", asset: "assets/player.svg" },
        },
      },
    },
    visualVariants: [],
    position: { x: 540, y: 1200 },
    size: { width: 180, height: 420 },
    interactions: null,
    movement: null,
  });
});

test("rejects an invalid character asset", () => {
  assert.throws(
    () => createSceneModel(createDocument({ asset: "/assets/player.svg" })),
    /character\.asset debe ser una ruta SVG relativa al frontend/,
  );
});

test("rejects an invalid character position", () => {
  assert.throws(
    () => createSceneModel(createDocument({ position: { x: 540, y: -1 } })),
    /character\.position\.y debe ser un número mayor o igual que cero/,
  );
});

test("places the character behind an element when its feet are above depth_y", () => {
  const character = createSceneModel(createDocument({ position: { x: 540, y: 800 } })).character;
  const element = { id: "table", z: 10, depthY: 950 };

  assert.equal(compareCharacterToElement(character, element), "behind");
  assert.equal(characterRenderIndex([element], character), 0);
});

test("places the character in front of an element when its feet are below depth_y", () => {
  const character = createSceneModel(createDocument({ position: { x: 540, y: 1100 } })).character;
  const element = { id: "table", z: 10, depthY: 950 };

  assert.equal(compareCharacterToElement(character, element), "in-front");
  assert.equal(characterRenderIndex([element], character), 1);
});

test("an element without depth_y does not participate in automatic depth", () => {
  const character = createSceneModel(createDocument()).character;

  assert.equal(compareCharacterToElement(character, { depthY: null }), null);
});

test("uses far_scale at far_y", () => {
  const model = createSceneModel(createDocument({}, depth));
  assert.equal(calculateCharacterScale(500, model.depthScale), 0.75);
});

test("uses near_scale at near_y", () => {
  const model = createSceneModel(createDocument({}, depth));
  assert.equal(calculateCharacterScale(1700, model.depthScale), 1);
});

test("interpolates scale linearly between far and near", () => {
  const model = createSceneModel(createDocument({}, depth));
  assert.equal(calculateCharacterScale(1100, model.depthScale), 0.875);
});

test("clamps scale outside the configured range", () => {
  const model = createSceneModel(createDocument({}, depth));
  assert.equal(calculateCharacterScale(100, model.depthScale), 0.75);
  assert.equal(calculateCharacterScale(2000, model.depthScale), 1);
});

test("uses scale 1 without scene depth configuration", () => {
  assert.equal(calculateCharacterScale(1200, null), 1);
});

test("anchors the character rectangle at the center of its feet", () => {
  const character = createSceneModel(createDocument()).character;
  const rectangle = characterRectangleToPercent(character, { width: 1080, height: 1920 }, 1);

  assert.equal(rectangle.left, 41.66666666666667);
  assert.equal(rectangle.top, 40.625);
  assert.equal(rectangle.width, 16.666666666666664);
  assert.equal(rectangle.height, 21.875);
});
