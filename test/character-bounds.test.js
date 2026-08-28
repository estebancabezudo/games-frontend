import assert from "node:assert/strict";
import test from "node:test";
import { constrainCharacterPosition } from "../character-bounds.js";
import { calculateCharacterScale } from "../scene-depth.js";

const character = {
  id: "player",
  asset: "assets/player.svg",
  position: { x: 540, y: 800 },
  size: { width: 180, height: 420 },
};
const sceneSize = { width: 1080, height: 1920 };
const depthScale = {
  nearY: 1700,
  nearScale: 1,
  farY: 500,
  farScale: 0.75,
};

function approximatelyEqual(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 0.000001, `${actual} != ${expected}`);
}

test("keeps the head inside the upper bound at scale 1", () => {
  const position = constrainCharacterPosition(character, null, sceneSize, { x: 540, y: 0 });
  approximatelyEqual(position.y, 420);
});

test("uses the scaled height for the upper bound", () => {
  const position = constrainCharacterPosition(character, depthScale, sceneSize, { x: 540, y: 0 });
  approximatelyEqual(position.y, 315);
});

test("keeps the full rendered character inside the left bound", () => {
  const position = constrainCharacterPosition(character, null, sceneSize, { x: 0, y: 800 });
  assert.equal(position.x, 90);
});

test("keeps the full rendered character inside the right bound", () => {
  const position = constrainCharacterPosition(character, null, sceneSize, { x: 1080, y: 800 });
  assert.equal(position.x, 990);
});

test("allows the feet to reach the lower scene bound", () => {
  const position = constrainCharacterPosition(character, null, sceneSize, { x: 540, y: 3000 });
  assert.equal(position.y, 1920);
});

test("leaves an interior position unchanged", () => {
  assert.deepEqual(
    constrainCharacterPosition(character, null, sceneSize, { x: 540, y: 800 }),
    { x: 540, y: 800 },
  );
});

test("uses depth scale for both horizontal and upper bounds", () => {
  const position = constrainCharacterPosition(character, depthScale, sceneSize, { x: 0, y: 800 });
  const scale = calculateCharacterScale(position.y, depthScale);
  approximatelyEqual(position.x, character.size.width * scale / 2);
  assert.ok(position.y - character.size.height * scale >= 0);
});

test("uses a deterministic finite position when the scene is too small", () => {
  const position = constrainCharacterPosition(
    character,
    null,
    { width: 100, height: 100 },
    { x: -500, y: -500 },
  );

  assert.deepEqual(position, { x: 50, y: 100 });
  assert.ok(Number.isFinite(position.x));
  assert.ok(Number.isFinite(position.y));
});
