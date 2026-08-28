import assert from "node:assert/strict";
import test from "node:test";
import {
  createAutonomousMovementRuntime,
  requestNextPatrolRoute,
} from "../actor-patrol.js";
import {
  createActorsRuntime,
  followControlledActorHorizontally,
} from "../actors-runtime.js";
import { advanceCharacterRuntime } from "../character-movement.js";
import { resolvePendingInteraction } from "../interaction-runtime.js";
import { createSceneModel } from "../scene-model.js";
import { actorRectangleToPercent } from "../scene-renderer.js";
import { createWalkModel } from "../walk-model.js";

const sceneSize = { width: 1000, height: 500 };

function actor(id, x, y, movement) {
  return {
    id,
    asset: `assets/${id}.svg`,
    visual: { directions: 2 },
    position: { x, y },
    size: { width: 40, height: 80 },
    interactions: null,
    movement: movement ?? null,
  };
}

function patrol(points) {
  return { type: "patrol", points };
}

function horizontalWalk() {
  return createWalkModel({
    nodes: [
      { id: "left", x: 0, y: 250 },
      { id: "right", x: 1000, y: 250 },
    ],
    paths: [{ from: "left", to: "right" }],
  });
}

function documentWithDog(movement) {
  return {
    game: { id: "example" },
    scene: { id: "room" },
    viewport: { orientation: "landscape" },
    size: sceneSize,
    background: { color: "#dddddd" },
    controlled_actor: "player",
    actors: [
      {
        id: "player",
        asset: "assets/player.svg",
        position: { x: 100, y: 250 },
        size: { width: 40, height: 80 },
      },
      {
        id: "dog",
        asset: "assets/dog.svg",
        position: { x: 300, y: 250 },
        size: { width: 40, height: 80 },
        ...(movement === undefined ? {} : { movement }),
      },
    ],
  };
}

test("parses a valid patrol without modifying its declared points", () => {
  const sourcePoints = [{ x: 200, y: 250 }, { x: 800, y: 250 }];
  const model = createSceneModel(documentWithDog({ type: "patrol", points: sourcePoints }));

  assert.deepEqual(model.actors[1].movement, {
    type: "patrol",
    enabledWhen: null,
    points: sourcePoints,
  });
  assert.notEqual(model.actors[1].movement.points, sourcePoints);
});

test("rejects unknown patrol types, too few points, and invalid coordinates", () => {
  assert.throws(
    () => createSceneModel(documentWithDog({ type: "random", points: [{ x: 1, y: 1 }] })),
    /movement\.type debe ser patrol/,
  );
  assert.throws(
    () => createSceneModel(documentWithDog({ type: "patrol", points: [{ x: 1, y: 1 }] })),
    /al menos 2 posiciones/,
  );
  assert.throws(
    () => createSceneModel(documentWithDog({
      type: "patrol",
      points: [{ x: -1, y: 1 }, { x: 2, y: 2 }],
    })),
    /movement\.points\[0\]\.x/,
  );
});

test("an actor without movement remains idle", () => {
  const model = createSceneModel(documentWithDog());
  const runtimes = createActorsRuntime(model.actors, model.size, model.depthScale);

  assert.equal(model.actors[1].movement, null);
  assert.equal(runtimes.dog.autonomousMovement, null);
  assert.equal(runtimes.dog.motion, "idle");
});

test("an autonomous actor receives an initial projected route and starts walking", () => {
  const dog = actor("dog", 300, 250, patrol([
    { x: 450, y: 200 },
    { x: 800, y: 300 },
  ]));
  const runtime = createActorsRuntime([dog]).dog;

  assert.equal(requestNextPatrolRoute(dog, runtime, horizontalWalk(), sceneSize), true);
  assert.deepEqual(runtime.destination, { x: 450, y: 250 });
  assert.equal(runtime.motion, "walking");
  assert.equal(runtime.autonomousMovement.nextPointIndex, 0);
});

test("completing patrol points advances and wraps from the last to the first", () => {
  const dog = actor("dog", 50, 250, patrol([
    { x: 200, y: 250 },
    { x: 800, y: 250 },
  ]));
  const runtime = createActorsRuntime([dog]).dog;

  requestNextPatrolRoute(dog, runtime, horizontalWalk(), sceneSize);
  advanceCharacterRuntime(runtime, 1, 1000);
  assert.deepEqual(runtime.position, { x: 200, y: 250 });
  requestNextPatrolRoute(dog, runtime, horizontalWalk(), sceneSize);
  assert.deepEqual(runtime.destination, { x: 800, y: 250 });
  advanceCharacterRuntime(runtime, 1, 1000);
  requestNextPatrolRoute(dog, runtime, horizontalWalk(), sceneSize);
  assert.deepEqual(runtime.destination, { x: 200, y: 250 });
});

test("a coincident first point continues directly to the second point", () => {
  const dog = actor("dog", 200, 250, patrol([
    { x: 200, y: 250 },
    { x: 800, y: 250 },
  ]));
  const runtime = createActorsRuntime([dog]).dog;

  requestNextPatrolRoute(dog, runtime, horizontalWalk(), sceneSize);

  assert.deepEqual(runtime.destination, { x: 800, y: 250 });
  assert.equal(runtime.autonomousMovement.nextPointIndex, 1);
  assert.equal(runtime.motion, "walking");
});

test("patrol reuses movement facing and motion semantics", () => {
  const dog = actor("dog", 200, 250, patrol([
    { x: 800, y: 250 },
    { x: 200, y: 250 },
  ]));
  const runtime = createActorsRuntime([dog]).dog;
  requestNextPatrolRoute(dog, runtime, horizontalWalk(), sceneSize);
  advanceCharacterRuntime(runtime, 0.1, 100);
  assert.equal(runtime.facing, "right");
  assert.equal(runtime.motion, "walking");

  advanceCharacterRuntime(runtime, 10, 1000);
  requestNextPatrolRoute(dog, runtime, horizontalWalk(), sceneSize);
  advanceCharacterRuntime(runtime, 0.1, 100);
  assert.equal(runtime.facing, "left");
  assert.equal(runtime.motion, "walking");
});

test("two autonomous actors keep independent patrol runtimes", () => {
  const dog = actor("dog", 200, 250, patrol([
    { x: 400, y: 250 },
    { x: 600, y: 250 },
  ]));
  const cat = actor("cat", 800, 250, patrol([
    { x: 700, y: 250 },
    { x: 500, y: 250 },
  ]));
  const runtimes = createActorsRuntime([dog, cat]);
  requestNextPatrolRoute(dog, runtimes.dog, horizontalWalk(), sceneSize);
  requestNextPatrolRoute(cat, runtimes.cat, horizontalWalk(), sceneSize);
  advanceCharacterRuntime(runtimes.dog, 0.5, 100);

  assert.notEqual(runtimes.dog.autonomousMovement, runtimes.cat.autonomousMovement);
  assert.notDeepEqual(runtimes.dog.position, { x: 200, y: 250 });
  assert.deepEqual(runtimes.cat.position, { x: 800, y: 250 });
});

test("an autonomous actor cannot move the controlled actor camera", () => {
  const actors = [actor("player", 500, 250), actor("dog", 800, 250)];
  const runtimes = createActorsRuntime(actors);
  const camera = { x: 100, viewportWorldWidth: 400 };

  followControlledActorHorizontally(camera, runtimes, "player", "dog", 1000);
  assert.equal(camera.x, 100);
  runtimes.player.position.x = 700;
  followControlledActorHorizontally(camera, runtimes, "player", "player", 1000);
  assert.equal(camera.x, 500);
});

test("an unreachable patrol stops only that actor with a clear error", () => {
  const disconnectedWalk = createWalkModel({
    nodes: [
      { id: "a", x: 0, y: 250 },
      { id: "b", x: 300, y: 250 },
      { id: "c", x: 700, y: 250 },
      { id: "d", x: 1000, y: 250 },
    ],
    paths: [
      { from: "a", to: "b" },
      { from: "c", to: "d" },
    ],
  });
  const dog = actor("dog", 100, 250, patrol([
    { x: 800, y: 250 },
    { x: 900, y: 250 },
  ]));
  const cat = actor("cat", 100, 250, patrol([
    { x: 200, y: 250 },
    { x: 250, y: 250 },
  ]));
  const runtimes = createActorsRuntime([dog, cat]);

  assert.equal(requestNextPatrolRoute(dog, runtimes.dog, disconnectedWalk, sceneSize), false);
  assert.equal(runtimes.dog.motion, "idle");
  assert.match(runtimes.dog.autonomousMovement.error, /Patrol del actor dog: No existe una ruta/);
  assert.equal(requestNextPatrolRoute(cat, runtimes.cat, disconnectedWalk, sceneSize), true);
  assert.equal(runtimes.cat.motion, "walking");
});

test("an autonomous patrol uses the same active paths as player navigation", () => {
  const state = { flags: { gate_open: false } };
  const walk = createWalkModel({
    nodes: [
      { id: "a", x: 0, y: 250 },
      { id: "b", x: 400, y: 250 },
      { id: "c", x: 600, y: 250 },
      { id: "d", x: 1000, y: 250 },
    ],
    paths: [
      { from: "a", to: "b" },
      { from: "b", to: "c", enabled_when: { flag: "gate_open", value: true } },
      { from: "c", to: "d" },
    ],
  }, state);
  const dog = actor("dog", 100, 250, patrol([
    { x: 900, y: 250 },
    { x: 800, y: 250 },
  ]));
  const runtime = createActorsRuntime([dog]).dog;

  assert.equal(requestNextPatrolRoute(dog, runtime, walk, sceneSize, state), false);
  assert.equal(runtime.motion, "idle");
  state.flags.gate_open = true;
  assert.equal(requestNextPatrolRoute(dog, runtime, walk, sceneSize, state), true);
  assert.equal(runtime.motion, "walking");
});

test("the rendered actor rectangle follows its autonomous runtime position", () => {
  const dog = actor("dog", 200, 250);
  const before = actorRectangleToPercent(dog, sceneSize, 1, 0);
  const after = actorRectangleToPercent(
    { ...dog, position: { x: 600, y: 300 } },
    sceneSize,
    1,
    0,
  );

  assert.notEqual(after.left, before.left);
  assert.notEqual(after.top, before.top);
});

test("an on_actor interaction still resolves by id after the actor moves", () => {
  const state = { inventory: ["dog_food"], flags: { dog_fed: false } };
  const model = createSceneModel({
    ...documentWithDog({
      type: "patrol",
      points: [{ x: 200, y: 250 }, { x: 800, y: 250 }],
    }),
    actors: documentWithDog({
      type: "patrol",
      points: [{ x: 200, y: 250 }, { x: 800, y: 250 }],
    }).actors.map((entry) => entry.id === "dog" ? {
      ...entry,
      interactions: { approach_distance: 100 },
    } : entry),
  }, state);
  const runtimes = createActorsRuntime(model.actors, model.size, model.depthScale);
  runtimes.dog.position = { x: 700, y: 250 };
  const resolved = resolvePendingInteraction(
    { targetType: "actor", targetId: "dog", itemId: "dog_food" },
    model,
    {
      itemId: "dog_food",
      targetType: "actor",
      targetId: "dog",
      effects: [{ type: "set_flag", flag: "dog_fed" }],
    },
    state,
    runtimes,
  );

  assert.deepEqual(resolved.effects, [{ type: "set_flag", flag: "dog_fed" }]);
});

test("the controlled actor cannot declare autonomous movement", () => {
  const document = documentWithDog();
  document.actors[0].movement = {
    type: "patrol",
    points: [{ x: 100, y: 250 }, { x: 200, y: 250 }],
  };

  assert.throws(
    () => createSceneModel(document),
    /controlled_actor no puede declarar movement autónomo/,
  );
});

test("autonomous runtime creation is null without movement", () => {
  assert.equal(createAutonomousMovementRuntime(null), null);
});
