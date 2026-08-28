import assert from "node:assert/strict";
import test from "node:test";
import {
  advanceCharacterRuntime,
  createCharacterMovementLoop,
  moveToward,
} from "../character-movement.js";
import {
  createCharacterRuntime,
  setCharacterDestination,
  setCharacterRoute,
} from "../character-runtime.js";
import {
  calculateCharacterScale,
  compareCharacterToElement,
} from "../scene-depth.js";

function character(position = { x: 100, y: 200 }) {
  return {
    id: "player",
    asset: "assets/player.svg",
    position,
    size: { width: 180, height: 420 },
  };
}

test("moves horizontally at the requested world distance", () => {
  assert.deepEqual(moveToward({ x: 0, y: 10 }, { x: 100, y: 10 }, 25), {
    position: { x: 25, y: 10 },
    arrived: false,
  });
});

test("moves vertically at the requested world distance", () => {
  assert.deepEqual(moveToward({ x: 10, y: 0 }, { x: 10, y: 100 }, 25), {
    position: { x: 10, y: 25 },
    arrived: false,
  });
});

test("moves diagonally along a straight line", () => {
  assert.deepEqual(moveToward({ x: 0, y: 0 }, { x: 3, y: 4 }, 2.5), {
    position: { x: 1.5, y: 2 },
    arrived: false,
  });
});

test("arrives exactly without overshooting the destination", () => {
  assert.deepEqual(moveToward({ x: 0, y: 0 }, { x: 3, y: 4 }, 10), {
    position: { x: 3, y: 4 },
    arrived: true,
  });
});

test("replacing a destination continues from the current runtime position", () => {
  const runtime = createCharacterRuntime(character({ x: 0, y: 0 }));
  setCharacterDestination(runtime, { x: 100, y: 0 }, { width: 200, height: 200 });
  advanceCharacterRuntime(runtime, 0.5, 100);
  setCharacterDestination(runtime, { x: 50, y: 100 }, { width: 200, height: 200 });
  advanceCharacterRuntime(runtime, 0.5, 100);

  assert.deepEqual(runtime.position, { x: 50, y: 50 });
  assert.deepEqual(runtime.destination, { x: 50, y: 100 });
});

test("runtime position does not modify the declared character model", () => {
  const model = character();
  const runtime = createCharacterRuntime(model);
  setCharacterDestination(runtime, { x: 500, y: 600 }, { width: 1080, height: 1920 });
  advanceCharacterRuntime(runtime, 1, 100);

  assert.deepEqual(model.position, { x: 100, y: 200 });
  assert.notDeepEqual(runtime.position, model.position);
});

test("runtime starts idle and a route changes it to walking", () => {
  const runtime = createCharacterRuntime(character({ x: 0, y: 0 }));
  assert.equal(runtime.motion, "idle");

  setCharacterRoute(runtime, [{ x: 100, y: 0 }], { width: 200, height: 200 });
  assert.equal(runtime.motion, "walking");
});

test("completing a route returns to idle and preserves facing", () => {
  const runtime = createCharacterRuntime(character({ x: 0, y: 0 }));
  setCharacterRoute(runtime, [{ x: 100, y: 0 }], { width: 200, height: 200 });

  advanceCharacterRuntime(runtime, 1, 100);

  assert.equal(runtime.motion, "idle");
  assert.equal(runtime.facing, "default");
});

test("cancelling movement returns to idle", () => {
  const runtime = createCharacterRuntime(character({ x: 0, y: 0 }));
  setCharacterRoute(runtime, [{ x: 100, y: 0 }], { width: 200, height: 200 });
  const loop = createCharacterMovementLoop(runtime, () => {}, () => {}, {
    request: () => 1,
    cancel: () => {},
  });
  loop.start();

  loop.stop();

  assert.equal(runtime.motion, "idle");
  assert.equal(runtime.destination, null);
});

test("movement loop accepts an explicit logical speed", () => {
  const runtime = createCharacterRuntime(character({ x: 0, y: 0 }));
  setCharacterRoute(runtime, [{ x: 500, y: 0 }], { width: 600, height: 200 });
  const callbacks = [];
  const animationFrame = {
    request(callback) {
      callbacks.push(callback);
      return callbacks.length;
    },
    cancel() {},
  };
  const loop = createCharacterMovementLoop(
    runtime,
    () => {},
    () => {},
    animationFrame,
    100,
  );

  loop.start();
  callbacks.shift()(0);
  callbacks.shift()(1000);

  assert.deepEqual(runtime.position, { x: 100, y: 0 });
});

test("replacing a route while moving remains walking", () => {
  const runtime = createCharacterRuntime(character({ x: 0, y: 0 }));
  setCharacterRoute(runtime, [{ x: 100, y: 0 }], { width: 200, height: 200 });

  setCharacterRoute(runtime, [{ x: 0, y: 100 }], { width: 200, height: 200 });

  assert.equal(runtime.motion, "walking");
});

test("runtime Y changes the depth scale", () => {
  const depthScale = { farY: 500, farScale: 0.75, nearY: 1700, nearScale: 1 };
  assert.ok(calculateCharacterScale(600, depthScale) < calculateCharacterScale(1400, depthScale));
});

test("runtime Y changes the relation to an element depth_y", () => {
  const runtimeCharacter = character({ x: 540, y: 800 });
  const table = { depthY: 950 };
  assert.equal(compareCharacterToElement(runtimeCharacter, table), "behind");
  runtimeCharacter.position = { x: 540, y: 1100 };
  assert.equal(compareCharacterToElement(runtimeCharacter, table), "in-front");
});

test("a new route replaces every point from the previous route", () => {
  const runtime = createCharacterRuntime(character({ x: 0, y: 0 }));
  setCharacterRoute(runtime, [{ x: 50, y: 0 }, { x: 100, y: 0 }], {
    width: 200,
    height: 200,
  });
  advanceCharacterRuntime(runtime, 0.25, 100);
  setCharacterRoute(runtime, [{ x: 25, y: 100 }], { width: 200, height: 200 });

  assert.deepEqual(runtime.destination, { x: 25, y: 100 });
  assert.deepEqual(runtime.route, [{ x: 25, y: 100 }]);
});

test("uses one frame distance continuously across multiple route points", () => {
  const runtime = createCharacterRuntime(character({ x: 0, y: 0 }));
  setCharacterRoute(runtime, [{ x: 3, y: 0 }, { x: 3, y: 4 }], {
    width: 200,
    height: 200,
  });

  advanceCharacterRuntime(runtime, 1, 10);

  assert.deepEqual(runtime.position, { x: 3, y: 4 });
  assert.equal(runtime.destination, null);
  assert.deepEqual(runtime.route, []);
});

test("notifies completion only after the complete route, not an intermediate point", () => {
  const runtime = createCharacterRuntime(character({ x: 0, y: 0 }));
  setCharacterRoute(runtime, [{ x: 500, y: 0 }, { x: 1000, y: 0 }], {
    width: 1200,
    height: 1200,
  });
  const callbacks = [];
  let completions = 0;
  const animationFrame = {
    request(callback) {
      callbacks.push(callback);
      return callbacks.length;
    },
    cancel() {},
  };
  const loop = createCharacterMovementLoop(
    runtime,
    () => {},
    () => { completions += 1; },
    animationFrame,
  );

  loop.start();
  callbacks.shift()(0);
  callbacks.shift()(1000);
  assert.equal(completions, 0);
  assert.deepEqual(runtime.position, { x: 600, y: 0 });

  callbacks.shift()(2000);
  assert.equal(completions, 1);
  assert.deepEqual(runtime.position, { x: 1000, y: 0 });
});
