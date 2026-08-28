import assert from "node:assert/strict";
import test from "node:test";
import {
  actorAnimationIsActive,
  advanceActorAnimation,
  createActorAnimationRuntime,
  currentActorAnimationAsset,
  selectActorAnimation,
} from "../actor-animation.js";
import { resolveActorVisual } from "../character-visual.js";
import { createSceneModel } from "../scene-model.js";

function sceneDocument(rightRepresentation, idleRight = "assets/player-right.svg") {
  return {
    game: { id: "example" },
    scene: { id: "room" },
    viewport: { orientation: "portrait" },
    size: { width: 1080, height: 1920 },
    background: { color: "#dddddd" },
    character: {
      id: "player",
      visual: {
        directions: 2,
        states: {
          idle: {
            left: "assets/player-left.svg",
            right: idleRight,
          },
          walking: {
            left: "assets/player-walk-left.svg",
            right: rightRepresentation,
          },
        },
      },
      position: { x: 540, y: 900 },
      size: { width: 180, height: 420 },
    },
  };
}

function animation(overrides = {}) {
  return {
    animation: {
      frames: ["assets/frame-1.svg", "assets/frame-2.svg", "assets/frame-3.svg"],
      fps: 8,
      loop: true,
      ...overrides,
    },
  };
}

test("normalizes existing strings and explicit assets as static representations", () => {
  const stringVisual = createSceneModel(sceneDocument("assets/player-walk-right.svg"))
    .character.visual;
  const explicitVisual = createSceneModel(sceneDocument({
    asset: "assets/player-walk-right.svg",
  })).character.visual;

  assert.deepEqual(resolveActorVisual(stringVisual, "walking", "right"), {
    type: "asset",
    asset: "assets/player-walk-right.svg",
  });
  assert.deepEqual(resolveActorVisual(explicitVisual, "walking", "right"), {
    type: "asset",
    asset: "assets/player-walk-right.svg",
  });
});

test("normalizes a valid animation and defaults loop to true", () => {
  const visual = createSceneModel(sceneDocument(animation({ loop: undefined })))
    .character.visual;

  assert.deepEqual(resolveActorVisual(visual, "walking", "right"), {
    type: "animation",
    frames: ["assets/frame-1.svg", "assets/frame-2.svg", "assets/frame-3.svg"],
    fps: 8,
    loop: true,
  });
});

test("rejects animations with fewer than two frames", () => {
  assert.throws(
    () => createSceneModel(sceneDocument(animation({ frames: ["assets/one.svg"] }))),
    /frames debe contener al menos 2 assets/,
  );
});

test("rejects non-positive fps and invalid loop", () => {
  assert.throws(
    () => createSceneModel(sceneDocument(animation({ fps: 0 }))),
    /fps debe ser un número mayor que cero/,
  );
  assert.throws(
    () => createSceneModel(sceneDocument(animation({ loop: "yes" }))),
    /loop debe ser booleano/,
  );
});

test("rejects a representation mixing asset and animation", () => {
  assert.throws(
    () => createSceneModel(sceneDocument({
      asset: "assets/player.svg",
      ...animation(),
    })),
    /exactamente asset o animation/,
  );
});

test("advances frames according to fps and elapsed real time", () => {
  const runtime = createActorAnimationRuntime();
  const representation = {
    type: "animation",
    frames: ["1.svg", "2.svg", "3.svg", "4.svg"],
    fps: 8,
    loop: true,
  };
  selectActorAnimation(runtime, representation, "walking", "right");

  advanceActorAnimation(runtime, 0.125);
  assert.equal(runtime.frameIndex, 1);
  advanceActorAnimation(runtime, 0.375);
  assert.equal(runtime.frameIndex, 0);
});

test("loop returns to the first frame and non-loop remains at the last", () => {
  const looping = createActorAnimationRuntime();
  selectActorAnimation(looping, {
    type: "animation", frames: ["1.svg", "2.svg"], fps: 2, loop: true,
  }, "walking", "right");
  advanceActorAnimation(looping, 1);
  assert.equal(looping.frameIndex, 0);

  const finite = createActorAnimationRuntime();
  selectActorAnimation(finite, {
    type: "animation", frames: ["1.svg", "2.svg", "3.svg"], fps: 2, loop: false,
  }, "walking", "right");
  advanceActorAnimation(finite, 10);
  assert.equal(finite.frameIndex, 2);
  assert.equal(actorAnimationIsActive(finite), false);
});

test("changing facing or motion restarts at frame zero", () => {
  const runtime = createActorAnimationRuntime();
  const representation = {
    type: "animation", frames: ["1.svg", "2.svg"], fps: 2, loop: true,
  };
  selectActorAnimation(runtime, representation, "walking", "right");
  advanceActorAnimation(runtime, 0.5);
  assert.equal(runtime.frameIndex, 1);

  selectActorAnimation(runtime, representation, "walking", "down");
  assert.equal(runtime.frameIndex, 0);
  advanceActorAnimation(runtime, 0.5);
  selectActorAnimation(runtime, representation, "idle", "down");
  assert.equal(runtime.frameIndex, 0);
});

test("the same motion and facing selection does not restart", () => {
  const runtime = createActorAnimationRuntime();
  const representation = {
    type: "animation", frames: ["1.svg", "2.svg"], fps: 2, loop: true,
  };
  selectActorAnimation(runtime, representation, "walking", "right");
  advanceActorAnimation(runtime, 0.5);

  assert.equal(selectActorAnimation(runtime, representation, "walking", "right"), false);
  assert.equal(runtime.frameIndex, 1);
});

test("a new visual-state revision restarts the same talking representation", () => {
  const runtime = createActorAnimationRuntime();
  const representation = {
    type: "animation", frames: ["1.svg", "2.svg"], fps: 2, loop: true,
  };
  selectActorAnimation(runtime, representation, "talking", "right", 1);
  advanceActorAnimation(runtime, 0.5);
  assert.equal(runtime.frameIndex, 1);

  assert.equal(
    selectActorAnimation(runtime, representation, "talking", "right", 2),
    true,
  );
  assert.equal(runtime.frameIndex, 0);
});

test("changing to talking restarts animation but the same talking selection continues", () => {
  const runtime = createActorAnimationRuntime();
  const idle = {
    type: "animation", frames: ["idle-1.svg", "idle-2.svg"], fps: 2, loop: true,
  };
  const talking = {
    type: "animation", frames: ["talk-1.svg", "talk-2.svg"], fps: 4, loop: true,
  };
  selectActorAnimation(runtime, idle, "idle", "right");
  advanceActorAnimation(runtime, 0.5);

  assert.equal(selectActorAnimation(runtime, talking, "talking", "right"), true);
  assert.equal(runtime.frameIndex, 0);
  advanceActorAnimation(runtime, 0.25);
  assert.equal(runtime.frameIndex, 1);
  assert.equal(selectActorAnimation(runtime, talking, "talking", "right"), false);
  assert.equal(runtime.frameIndex, 1);
});

test("an animated idle representation advances without character movement", () => {
  const visual = createSceneModel(sceneDocument(
    "assets/player-walk-right.svg",
    animation(),
  )).character.visual;
  const runtime = createActorAnimationRuntime();
  const idle = resolveActorVisual(visual, "idle", "right");
  selectActorAnimation(runtime, idle, "idle", "right");

  advanceActorAnimation(runtime, 0.125);

  assert.equal(currentActorAnimationAsset(runtime), "assets/frame-2.svg");
});
