import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateViewportWorldWidth,
  createHorizontalCameraRuntime,
  followCharacterHorizontally,
} from "../horizontal-camera.js";
import {
  canvasPointToWorld,
  screenPointToWorldLogical,
  worldPointToScreen,
} from "../scene-coordinates.js";

test("a scene narrower than the viewport keeps camera.x at zero", () => {
  const width = calculateViewportWorldWidth(
    { width: 800, height: 1920 },
    { width: 450, height: 800 },
  );
  assert.equal(width, 800);
  assert.equal(createHorizontalCameraRuntime({ width: 800 }, width, 400).x, 0);
});

test("centers the camera on a character in a wide scene", () => {
  const camera = createHorizontalCameraRuntime({ width: 3000 }, 1080, 1500);
  assert.equal(camera.x, 960);
});

test("clamps the camera near and at the left edge", () => {
  const camera = createHorizontalCameraRuntime({ width: 3000 }, 1080, 200);
  assert.equal(camera.x, 0);
  assert.equal(worldPointToScreen({ x: 90, y: 0 }, camera.x).x, 90);
});

test("clamps the camera near and at the right edge", () => {
  const camera = createHorizontalCameraRuntime({ width: 3000 }, 1080, 2900);
  assert.equal(camera.x, 1920);
  assert.equal(worldPointToScreen({ x: 2910, y: 0 }, camera.x).x, 990);
});

test("world to screen supports zero and displaced camera positions", () => {
  assert.deepEqual(worldPointToScreen({ x: 600, y: 400 }, 0), { x: 600, y: 400 });
  assert.deepEqual(worldPointToScreen({ x: 1600, y: 400 }, 1000), { x: 600, y: 400 });
});

test("screen to world includes camera.x", () => {
  assert.deepEqual(screenPointToWorldLogical({ x: 600, y: 400 }, 1000), {
    x: 1600,
    y: 400,
  });
});

test("world to screen to world is a round trip", () => {
  const world = { x: 1730, y: 900 };
  assert.deepEqual(screenPointToWorldLogical(worldPointToScreen(world, 900), 900), world);
});

test("a displaced hotspot resolves back to its world position", () => {
  const hotspot = { x: 2400, y: 600, width: 100, height: 200 };
  const screen = worldPointToScreen({ x: hotspot.x, y: hotspot.y }, 1920);
  assert.deepEqual(screenPointToWorldLogical(screen, 1920), { x: 2400, y: 600 });
});

test("a movement destination after camera displacement uses world coordinates", () => {
  assert.deepEqual(
    canvasPointToWorld(
      { x: 500, y: 400 },
      { width: 1000, height: 800 },
      { width: 1080, height: 1920 },
      1000,
      { width: 3000, height: 1920 },
    ),
    { x: 1540, y: 960 },
  );
});

test("calculates visible logical width in portrait and landscape previews", () => {
  assert.equal(
    calculateViewportWorldWidth(
      { width: 3000, height: 1920 },
      { width: 450, height: 800 },
    ),
    1080,
  );
  assert.equal(
    calculateViewportWorldWidth(
      { width: 3000, height: 1080 },
      { width: 800, height: 450 },
    ),
    1920,
  );
});

test("following updates camera exactly without smoothing", () => {
  const camera = { x: 0, viewportWorldWidth: 1080 };
  followCharacterHorizontally(camera, 2000, 3000);
  assert.equal(camera.x, 1460);
});
