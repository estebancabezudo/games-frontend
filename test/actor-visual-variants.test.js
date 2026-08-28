import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveActorEffectiveVisual,
} from "../actor-visual-variants.js";
import {
  advanceActorAnimation,
  createActorAnimationRuntime,
  selectActorAnimation,
} from "../actor-animation.js";
import { createActorsRuntime } from "../actors-runtime.js";
import { requestNextPatrolRoute } from "../actor-patrol.js";
import {
  resolveActorVisual,
  resolveActorVisualState,
} from "../character-visual.js";
import { setCharacterRoute } from "../character-runtime.js";
import { createSceneModel } from "../scene-model.js";

function directionalStates(prefix, animated = false) {
  const representation = (direction) => animated
    ? {
      animation: {
        frames: [
          `assets/${prefix}-${direction}-1.svg`,
          `assets/${prefix}-${direction}-2.svg`,
        ],
        fps: 2,
      },
    }
    : `assets/${prefix}-${direction}.svg`;
  return {
    idle: {
      left: representation("left"),
      right: representation("right"),
    },
    walking: {
      left: representation("walk-left"),
      right: representation("walk-right"),
    },
  };
}

function actor(id, variants, movement) {
  return {
    id,
    visual: {
      directions: 2,
      states: directionalStates(`${id}-normal`, true),
    },
    ...(variants === undefined ? {} : { variants }),
    ...(movement === undefined ? {} : { movement }),
    position: { x: id === "player" ? 300 : 700, y: 500 },
    size: { width: 100, height: 160 },
  };
}

function variant(flag, value = true, prefix = "dog-fed") {
  return {
    when: { flag, value },
    states: directionalStates(prefix, true),
  };
}

function sceneDocument(actors, flags = {}) {
  return {
    game: { id: "example" },
    scene: { id: "room" },
    viewport: { orientation: "landscape" },
    size: { width: 1000, height: 600 },
    background: { color: "#dddddd" },
    controlled_actor: "player",
    actors,
    walk: {
      nodes: [
        { id: "left", x: 0, y: 500 },
        { id: "right", x: 1000, y: 500 },
      ],
      paths: [{ from: "left", to: "right" }],
    },
    state: { inventory: [], flags },
  };
}

function createModel(actors, flags) {
  const gameState = { inventory: [], flags: { ...flags } };
  return {
    gameState,
    model: createSceneModel(sceneDocument(actors, flags), gameState),
  };
}

function representation(actorModel, gameState, motion = "idle", facing = "right") {
  return resolveActorVisual(
    resolveActorEffectiveVisual(actorModel, gameState),
    motion,
    facing,
  );
}

test("an actor without variants keeps its existing visual behavior", () => {
  const { model, gameState } = createModel([
    actor("player"),
    actor("dog"),
  ], {});

  assert.deepEqual(model.actors[1].visualVariants, []);
  assert.equal(
    representation(model.actors[1], gameState).frames[0],
    "assets/dog-normal-right-1.svg",
  );
});

test("a true flag selects a valid visual variant", () => {
  const { model, gameState } = createModel([
    actor("player"),
    actor("dog", [variant("dog_fed")]),
  ], { dog_fed: true });

  assert.equal(
    representation(model.actors[1], gameState).frames[0],
    "assets/dog-fed-right-1.svg",
  );
});

test("a variant can match value false", () => {
  const { model, gameState } = createModel([
    actor("player"),
    actor("dog", [variant("dog_fed", false, "dog-hungry")]),
  ], { dog_fed: false });

  assert.equal(
    representation(model.actors[1], gameState).frames[0],
    "assets/dog-hungry-right-1.svg",
  );
});

test("no matching variant uses the base visual", () => {
  const { model, gameState } = createModel([
    actor("player"),
    actor("dog", [variant("dog_fed")]),
  ], { dog_fed: false });

  assert.equal(
    representation(model.actors[1], gameState).frames[0],
    "assets/dog-normal-right-1.svg",
  );
});

test("an actor variant rejects a missing flag and a non-boolean value", () => {
  assert.throws(
    () => createModel([
      actor("player"),
      actor("dog", [variant("missing")]),
    ], { dog_fed: false }),
    /flag refiere a un flag no declarado: missing/,
  );
  assert.throws(
    () => createModel([
      actor("player"),
      actor("dog", [variant("dog_fed", "yes")]),
    ], { dog_fed: false }),
    /value debe ser true o false/,
  );
});

test("two matching variants make the scene invalid", () => {
  assert.throws(
    () => createModel([
      actor("player"),
      actor("dog", [
        variant("dog_fed", true, "dog-fed"),
        variant("dog_fed", true, "dog-happy"),
      ]),
    ], { dog_fed: true }),
    /actor dog tiene más de una variante visual activa/,
  );
});

test("changing and restoring a flag switches between variant and base", () => {
  const { model, gameState } = createModel([
    actor("player"),
    actor("dog", [variant("dog_fed")]),
  ], { dog_fed: false });
  const dog = model.actors[1];
  const base = representation(dog, gameState);

  gameState.flags.dog_fed = true;
  const fed = representation(dog, gameState);
  gameState.flags.dog_fed = false;

  assert.notEqual(fed, base);
  assert.equal(fed.frames[0], "assets/dog-fed-right-1.svg");
  assert.equal(representation(dog, gameState), base);
});

test("a different effective visual restarts animation while the same visual does not", () => {
  const { model, gameState } = createModel([
    actor("player"),
    actor("dog", [variant("dog_fed")]),
  ], { dog_fed: false });
  const dog = model.actors[1];
  const animationRuntime = createActorAnimationRuntime();
  const base = representation(dog, gameState, "walking", "right");
  selectActorAnimation(animationRuntime, base, "walking", "right");
  advanceActorAnimation(animationRuntime, 0.5);
  assert.equal(animationRuntime.frameIndex, 1);
  assert.equal(selectActorAnimation(animationRuntime, base, "walking", "right"), false);
  assert.equal(animationRuntime.frameIndex, 1);

  gameState.flags.dog_fed = true;
  const fed = representation(dog, gameState, "walking", "right");
  assert.equal(selectActorAnimation(animationRuntime, fed, "walking", "right"), true);
  assert.equal(animationRuntime.frameIndex, 0);

  gameState.flags.dog_fed = false;
  assert.equal(selectActorAnimation(
    animationRuntime,
    representation(dog, gameState, "walking", "right"),
    "walking",
    "right",
  ), true);
  assert.equal(animationRuntime.frameIndex, 0);
});

test("changing a walking actor visual preserves motion, facing, and route", () => {
  const { model, gameState } = createModel([
    actor("player"),
    actor("dog", [variant("dog_fed")]),
  ], { dog_fed: false });
  const runtime = createActorsRuntime(model.actors, model.size, model.depthScale).dog;
  setCharacterRoute(runtime, [{ x: 900, y: 500 }], model.size);
  runtime.facing = "right";
  const before = structuredClone(runtime);

  gameState.flags.dog_fed = true;
  representation(model.actors[1], gameState, runtime.motion, runtime.facing);

  assert.deepEqual(runtime, before);
  assert.equal(runtime.motion, "walking");
  assert.equal(runtime.facing, "right");
});

test("visual variants do not alter autonomous patrol or controlled routes", () => {
  const patrol = {
    type: "patrol",
    points: [{ x: 600, y: 500 }, { x: 900, y: 500 }],
  };
  const { model, gameState } = createModel([
    actor("player", [variant("player_changed", true, "player-alt")]),
    actor("dog", [variant("dog_fed")], patrol),
  ], { player_changed: false, dog_fed: false });
  const runtimes = createActorsRuntime(model.actors, model.size, model.depthScale);
  setCharacterRoute(runtimes.player, [{ x: 500, y: 500 }], model.size);
  requestNextPatrolRoute(model.actors[1], runtimes.dog, model.walk, model.size);
  const playerBefore = structuredClone(runtimes.player);
  const dogBefore = structuredClone(runtimes.dog);

  gameState.flags.player_changed = true;
  gameState.flags.dog_fed = true;
  representation(model.actors[0], gameState, runtimes.player.motion, runtimes.player.facing);
  representation(model.actors[1], gameState, runtimes.dog.motion, runtimes.dog.facing);

  assert.deepEqual(runtimes.player, playerBefore);
  assert.deepEqual(runtimes.dog, dogBefore);
  assert.notEqual(runtimes.dog.autonomousMovement, null);
});

test("multiple actors resolve their visual variants independently", () => {
  const { model, gameState } = createModel([
    actor("player", [variant("player_changed", true, "player-alt")]),
    actor("dog", [variant("dog_fed")]),
  ], { player_changed: false, dog_fed: true });

  assert.equal(
    representation(model.actors[0], gameState).frames[0],
    "assets/player-normal-right-1.svg",
  );
  assert.equal(
    representation(model.actors[1], gameState).frames[0],
    "assets/dog-fed-right-1.svg",
  );
});

test("an active variant uses its own talking representation", () => {
  const player = actor("player");
  const dog = actor("dog");
  dog.visual.states.talking = directionalStates("dog-normal-talk", true).idle;
  dog.variants = [{
    when: { flag: "dog_fed", value: true },
    states: {
      ...directionalStates("dog-fed", true),
      talking: directionalStates("dog-fed-talk", true).idle,
    },
  }];
  const { model, gameState } = createModel([player, dog], { dog_fed: true });
  const effectiveVisual = resolveActorEffectiveVisual(model.actors[1], gameState);
  const visualState = resolveActorVisualState(effectiveVisual, "idle", "talking");

  assert.equal(visualState, "talking");
  assert.equal(
    resolveActorVisual(effectiveVisual, visualState, "right").frames[0],
    "assets/dog-fed-talk-right-1.svg",
  );
});

test("a variant without talking falls back to its own idle representation", () => {
  const player = actor("player");
  const dog = actor("dog", [variant("dog_fed")]);
  dog.visual.states.talking = directionalStates("dog-normal-talk", true).idle;
  const { model, gameState } = createModel([player, dog], { dog_fed: true });
  const effectiveVisual = resolveActorEffectiveVisual(model.actors[1], gameState);
  const visualState = resolveActorVisualState(effectiveVisual, "idle", "talking");

  assert.equal(visualState, "idle");
  assert.equal(
    resolveActorVisual(effectiveVisual, visualState, "right").frames[0],
    "assets/dog-fed-right-1.svg",
  );
});
