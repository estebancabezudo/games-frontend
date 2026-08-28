import assert from "node:assert/strict";
import test from "node:test";
import {
  canvasPointToWorld,
  screenPointToCanvas,
  screenPointToWorld,
} from "../scene-coordinates.js";

test("converts screen coordinates into explicit canvas coordinates", () => {
  assert.deepEqual(
    screenPointToCanvas({ x: 260, y: 170 }, { left: 100, top: 50 }),
    { x: 160, y: 120 },
  );
});

test("converts portrait canvas coordinates to world coordinates", () => {
  assert.deepEqual(
    canvasPointToWorld(
      { x: 135, y: 240 },
      { width: 270, height: 480 },
      { width: 1080, height: 1920 },
    ),
    { x: 540, y: 960 },
  );
});

test("converts landscape canvas coordinates to world coordinates", () => {
  assert.deepEqual(
    canvasPointToWorld(
      { x: 480, y: 270 },
      { width: 960, height: 540 },
      { width: 1920, height: 1080 },
    ),
    { x: 960, y: 540 },
  );
});

test("preserves zero coordinates", () => {
  assert.deepEqual(
    canvasPointToWorld(
      { x: 0, y: 0 },
      { width: 270, height: 480 },
      { width: 1080, height: 1920 },
    ),
    { x: 0, y: 0 },
  );
});

test("clamps coordinates to the maximum scene bounds", () => {
  assert.deepEqual(
    screenPointToWorld(
      { x: 500, y: 600 },
      { left: 100, top: 100, width: 300, height: 400 },
      { width: 1080, height: 1920 },
    ),
    { x: 1080, y: 1920 },
  );
});
