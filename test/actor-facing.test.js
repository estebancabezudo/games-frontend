import assert from "node:assert/strict";
import test from "node:test";
import {
  actorFacingFromMovement,
  initialActorFacing,
} from "../actor-facing.js";
import { advanceCharacterRuntime } from "../character-movement.js";
import { createCharacterRuntime, setCharacterRoute } from "../character-runtime.js";
import { resolveCharacterAsset } from "../character-visual.js";
import { createSceneModel } from "../scene-model.js";

function vectorAt(degrees) {
  const radians = degrees * Math.PI / 180;
  return { dx: Math.cos(radians), dy: Math.sin(radians) };
}

function documentWithCharacter(character) {
  return {
    game: { id: "example" },
    scene: { id: "room" },
    viewport: { orientation: "portrait" },
    size: { width: 1080, height: 1920 },
    background: { color: "#dddddd" },
    character: {
      id: "player",
      position: { x: 540, y: 900 },
      size: { width: 180, height: 420 },
      ...character,
    },
  };
}

function assetsFor(directionNames) {
  return Object.fromEntries(directionNames.map((direction) => [
    direction,
    `assets/player-${direction}.svg`,
  ]));
}

test("classifies right, left, up, down, and all diagonals in screen coordinates", () => {
  const cases = [
    [{ x: 1, y: 0 }, "right"],
    [{ x: -1, y: 0 }, "left"],
    [{ x: 0, y: -1 }, "up"],
    [{ x: 0, y: 1 }, "down"],
    [{ x: 1, y: -1 }, "up_right"],
    [{ x: 1, y: 1 }, "down_right"],
    [{ x: -1, y: 1 }, "down_left"],
    [{ x: -1, y: -1 }, "up_left"],
  ];

  cases.forEach(([vector, expected]) => {
    assert.equal(actorFacingFromMovement(vector.x, vector.y, 8, "right"), expected);
  });
});

test("uses equal angular sectors with deterministic exact boundaries", () => {
  const boundaries = [
    [22.5, "down_right"],
    [67.5, "down"],
    [112.5, "down_left"],
    [157.5, "left"],
    [202.5, "up_left"],
    [247.5, "up"],
    [292.5, "up_right"],
    [337.5, "right"],
  ];

  boundaries.forEach(([degrees, expected]) => {
    const vector = vectorAt(degrees);
    assert.equal(
      actorFacingFromMovement(vector.dx, vector.dy, 8, "right"),
      expected,
      `${degrees} degrees`,
    );
  });
});

test("a zero vector preserves the current facing", () => {
  assert.equal(actorFacingFromMovement(0, 0, 8, "up_left"), "up_left");
});

test("mode 1 uses one asset for every movement direction", () => {
  const visual = createSceneModel(documentWithCharacter({
    visual: { directions: 1, asset: "assets/player.svg" },
  })).character.visual;

  assert.equal(initialActorFacing(1), "default");
  assert.equal(actorFacingFromMovement(-1, -1, 1, "default"), "default");
  assert.equal(resolveCharacterAsset(visual, "default"), "assets/player.svg");
});

test("mode 2 accepts exactly left and right assets", () => {
  const visual = createSceneModel(documentWithCharacter({
    visual: {
      directions: 2,
      assets: assetsFor(["left", "right"]),
    },
  })).character.visual;

  assert.deepEqual(Object.keys(visual.states.idle), ["left", "right"]);
});

test("mode 4 accepts exactly four directional assets", () => {
  const visual = createSceneModel(documentWithCharacter({
    visual: {
      directions: 4,
      assets: assetsFor(["up", "right", "down", "left"]),
    },
  })).character.visual;

  assert.equal(resolveCharacterAsset(visual, "up"), "assets/player-up.svg");
  assert.equal(resolveCharacterAsset(visual, "left"), "assets/player-left.svg");
});

test("mode 8 accepts exactly eight directional assets", () => {
  const directions = [
    "up", "up_right", "right", "down_right",
    "down", "down_left", "left", "up_left",
  ];
  const visual = createSceneModel(documentWithCharacter({
    visual: { directions: 8, assets: assetsFor(directions) },
  })).character.visual;

  assert.deepEqual(Object.keys(visual.states.idle), directions);
});

test("mode 2 keeps its last horizontal facing during mainly vertical movement", () => {
  assert.equal(actorFacingFromMovement(0, -10, 2, "left"), "left");
  assert.equal(actorFacingFromMovement(1, 10, 2, "right"), "right");
  assert.equal(actorFacingFromMovement(0, 10, 2), "right");
});

test("starting a new route segment changes facing and stopping preserves it", () => {
  const character = createSceneModel(documentWithCharacter({
    visual: {
      directions: 4,
      assets: assetsFor(["up", "right", "down", "left"]),
    },
    position: { x: 0, y: 500 },
  })).character;
  const runtime = createCharacterRuntime(character);
  setCharacterRoute(runtime, [{ x: 100, y: 500 }, { x: 100, y: 600 }], {
    width: 1000,
    height: 1000,
  });

  advanceCharacterRuntime(runtime, 1, 100);
  assert.equal(runtime.facing, "right");
  advanceCharacterRuntime(runtime, 0.1, 100);
  assert.equal(runtime.facing, "down");
  advanceCharacterRuntime(runtime, 1, 100);
  assert.equal(runtime.destination, null);
  assert.equal(runtime.facing, "down");
});

test("rejects incomplete directional configuration", () => {
  assert.throws(() => createSceneModel(documentWithCharacter({
    visual: {
      directions: 4,
      assets: assetsFor(["up", "right", "down"]),
    },
  })), /debe declarar la dirección left/);
});

test("rejects unsupported modes and unknown direction assets", () => {
  assert.throws(() => createSceneModel(documentWithCharacter({
    visual: { directions: 3, assets: {} },
  })), /debe ser 1, 2, 4 u 8/);
  assert.throws(() => createSceneModel(documentWithCharacter({
    visual: {
      directions: 2,
      assets: { ...assetsFor(["left", "right"]), up: "assets/up.svg" },
    },
  })), /propiedades desconocidas: up/);
});

test("legacy character.asset is equivalent to one direction", () => {
  const character = createSceneModel(documentWithCharacter({
    asset: "assets/player.svg",
  })).character;

  assert.deepEqual(character.visual, {
    directions: 1,
    states: {
      idle: {
        default: { type: "asset", asset: "assets/player.svg" },
      },
      walking: {
        default: { type: "asset", asset: "assets/player.svg" },
      },
    },
  });
});
