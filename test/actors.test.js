import assert from "node:assert/strict";
import test from "node:test";
import {
  advanceActorAnimation,
  createActorAnimationRuntime,
  selectActorAnimation,
} from "../actor-animation.js";
import {
  controlledActorRuntime,
  createActorsRuntime,
  followControlledActorHorizontally,
} from "../actors-runtime.js";
import { advanceCharacterRuntime } from "../character-movement.js";
import { setCharacterRoute } from "../character-runtime.js";
import { orderActorsByDepth } from "../scene-depth.js";
import { createSceneModel } from "../scene-model.js";
import { actorRectangleToPercent } from "../scene-renderer.js";

function actor(id, x, y, asset = `assets/${id}.svg`) {
  return {
    id,
    asset,
    position: { x, y },
    size: { width: 100, height: 200 },
  };
}

function documentWithActors(actors, controlledActor = "player") {
  return {
    game: { id: "example" },
    scene: { id: "room" },
    viewport: { orientation: "portrait" },
    size: { width: 3000, height: 1920 },
    background: { color: "#dddddd" },
    actors,
    controlled_actor: controlledActor,
  };
}

test("parses multiple actors and identifies the controlled actor", () => {
  const model = createSceneModel(documentWithActors([
    actor("player", 500, 800),
    actor("dog", 1200, 1000),
  ]));

  assert.deepEqual(model.actors.map((entry) => entry.id), ["player", "dog"]);
  assert.equal(model.controlledActorId, "player");
  assert.equal(model.character, model.actors[0]);
});

test("rejects duplicate actor ids and a missing controlled actor", () => {
  assert.throws(
    () => createSceneModel(documentWithActors([
      actor("player", 500, 800),
      actor("player", 1200, 1000),
    ])),
    /id duplicado: player/,
  );
  assert.throws(
    () => createSceneModel(documentWithActors([actor("dog", 1200, 1000)])),
    /controlled_actor debe referir a un actor existente: player/,
  );
  const withoutControlled = documentWithActors([actor("player", 500, 800)]);
  delete withoutControlled.controlled_actor;
  assert.throws(
    () => createSceneModel(withoutControlled),
    /controlled_actor debe ser un texto no vacío/,
  );
});

test("rejects ambiguous character and actors declarations", () => {
  const document = documentWithActors([actor("player", 500, 800)]);
  document.character = actor("legacy", 100, 200);

  assert.throws(
    () => createSceneModel(document),
    /no puede declarar character y actors al mismo tiempo/,
  );
});

test("legacy character is normalized as the controlled actor", () => {
  const document = documentWithActors([]);
  delete document.actors;
  delete document.controlled_actor;
  document.character = actor("player", 500, 800);

  const model = createSceneModel(document);

  assert.deepEqual(model.actors.map((entry) => entry.id), ["player"]);
  assert.equal(model.controlledActorId, "player");
  assert.equal(model.character, model.actors[0]);
});

test("each actor has independent position, facing, and motion runtime", () => {
  const model = createSceneModel(documentWithActors([
    actor("player", 500, 800),
    actor("dog", 1200, 1000),
  ]));
  const runtimes = createActorsRuntime(model.actors, model.size, model.depthScale);

  runtimes.player.position.x = 700;
  runtimes.player.facing = "left";
  runtimes.player.motion = "walking";

  assert.deepEqual(runtimes.dog.position, { x: 1200, y: 1000 });
  assert.equal(runtimes.dog.facing, "default");
  assert.equal(runtimes.dog.motion, "idle");
  assert.equal(controlledActorRuntime(runtimes, model.controlledActorId), runtimes.player);
});

test("moving the controlled actor does not modify the dog", () => {
  const model = createSceneModel(documentWithActors([
    actor("player", 500, 800),
    actor("dog", 1200, 1000),
  ]));
  const runtimes = createActorsRuntime(model.actors, model.size, model.depthScale);
  const dogPosition = { ...runtimes.dog.position };
  setCharacterRoute(runtimes.player, [{ x: 900, y: 800 }], model.size);

  advanceCharacterRuntime(runtimes.player, 1, 200);

  assert.deepEqual(runtimes.dog.position, dogPosition);
  assert.notDeepEqual(runtimes.player.position, model.actors[0].position);
});

test("actor animation runtimes do not share frame state", () => {
  const representation = {
    type: "animation",
    frames: ["one.svg", "two.svg"],
    fps: 2,
    loop: true,
  };
  const player = createActorAnimationRuntime();
  const dog = createActorAnimationRuntime();
  selectActorAnimation(player, representation, "idle", "default");
  selectActorAnimation(dog, representation, "idle", "default");

  advanceActorAnimation(dog, 0.5);

  assert.equal(player.frameIndex, 0);
  assert.equal(dog.frameIndex, 1);
  assert.equal(dog.selection, "idle:default");
});

test("orders actors by feet Y and preserves YAML order for equal Y", () => {
  const actors = [
    actor("player", 500, 1000),
    actor("dog", 1200, 700),
    actor("cat", 900, 1000),
  ];
  const runtimes = createActorsRuntime(actors);

  assert.deepEqual(
    orderActorsByDepth(actors, runtimes).map(({ actor: entry }) => entry.id),
    ["dog", "player", "cat"],
  );
});

test("a non-controlled actor uses the same camera world transformation", () => {
  const dog = actor("dog", 2200, 1050);
  const rectangle = actorRectangleToPercent(
    dog,
    { width: 1000, height: 1920 },
    1,
    1500,
  );

  assert.equal(rectangle.left, 65);
  assert.ok(Math.abs(rectangle.top - 44.270833333333336) < 0.000001);
});

test("camera updates only for the controlled actor", () => {
  const actors = [actor("player", 500, 800), actor("dog", 2500, 1000)];
  const runtimes = createActorsRuntime(actors);
  const camera = { x: 0, viewportWorldWidth: 1000 };

  followControlledActorHorizontally(camera, runtimes, "player", "dog", 3000);
  assert.equal(camera.x, 0);
  runtimes.player.position.x = 1800;
  followControlledActorHorizontally(camera, runtimes, "player", "player", 3000);
  assert.equal(camera.x, 1300);
});
