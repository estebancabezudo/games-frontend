import assert from "node:assert/strict";
import test from "node:test";
import {
  patrolIsEnabled,
  reconcilePatrolRuntime,
} from "../actor-patrol.js";
import { resolveActorEffectiveVisual } from "../actor-visual-variants.js";
import { createActorsRuntime } from "../actors-runtime.js";
import { advanceCharacterRuntime } from "../character-movement.js";
import { applyFlagEffects } from "../flag-effects.js";
import { createSceneModel } from "../scene-model.js";

function actor(id, movement, extras = {}) {
  return {
    id,
    asset: `assets/${id}.svg`,
    position: { x: id === "player" ? 100 : id === "dog" ? 300 : 700, y: 250 },
    size: { width: 40, height: 80 },
    ...(movement === undefined ? {} : { movement }),
    ...extras,
  };
}

function patrol(flag, value = true) {
  return {
    type: "patrol",
    ...(flag === undefined ? {} : {
      enabled_when: { flag, value },
    }),
    points: [
      { x: 400, y: 250 },
      { x: 800, y: 250 },
    ],
  };
}

function documentWithActors(actors, flags, extras = {}) {
  return {
    game: { id: "example" },
    scene: { id: "room" },
    viewport: { orientation: "landscape" },
    size: { width: 1000, height: 500 },
    background: { color: "#dddddd" },
    controlled_actor: "player",
    actors,
    walk: {
      nodes: [
        { id: "left", x: 0, y: 250 },
        { id: "right", x: 1000, y: 250 },
      ],
      paths: [{ from: "left", to: "right" }],
    },
    state: { inventory: [], flags },
    ...extras,
  };
}

function createFixture(actors, flags, extras) {
  const gameState = { inventory: [], flags: { ...flags } };
  const model = createSceneModel(
    documentWithActors(actors, flags, extras),
    gameState,
  );
  const actorsRuntime = createActorsRuntime(
    model.actors,
    model.size,
    model.depthScale,
  );
  return { gameState, model, actorsRuntime };
}

function reconcile(fixture, actorId = "dog") {
  const actorModel = fixture.model.actors.find((candidate) => candidate.id === actorId);
  return reconcilePatrolRuntime(
    actorModel,
    fixture.actorsRuntime[actorId],
    fixture.gameState,
    fixture.model.walk,
    fixture.model.size,
  );
}

test("a patrol without enabled_when keeps its existing behavior", () => {
  const fixture = createFixture([
    actor("player"),
    actor("dog", patrol()),
  ], {});

  assert.equal(fixture.model.actors[1].movement.enabledWhen, null);
  assert.equal(patrolIsEnabled(fixture.model.actors[1], fixture.gameState), true);
  assert.equal(reconcile(fixture), "start");
  assert.notEqual(fixture.actorsRuntime.dog.destination, null);
});

test("matching true and false conditions activate patrol", () => {
  const trueFixture = createFixture([
    actor("player"),
    actor("dog", patrol("dog_run", true)),
  ], { dog_run: true });
  const falseFixture = createFixture([
    actor("player"),
    actor("dog", patrol("dog_run", false)),
  ], { dog_run: false });

  assert.equal(reconcile(trueFixture), "start");
  assert.equal(reconcile(falseFixture), "start");
});

test("a non-matching condition leaves the autonomous actor idle", () => {
  const fixture = createFixture([
    actor("player"),
    actor("dog", patrol("dog_run", true)),
  ], { dog_run: false });

  assert.equal(reconcile(fixture), "none");
  assert.equal(fixture.actorsRuntime.dog.motion, "idle");
  assert.equal(fixture.actorsRuntime.dog.destination, null);
});

test("enabled_when rejects an undeclared flag and non-boolean value", () => {
  assert.throws(
    () => createFixture([
      actor("player"),
      actor("dog", patrol("missing", true)),
    ], { dog_run: true }),
    /enabled_when\.flag refiere a un flag no declarado: missing/,
  );
  assert.throws(
    () => createFixture([
      actor("player"),
      actor("dog", patrol("dog_run", "yes")),
    ], { dog_run: true }),
    /enabled_when\.value debe ser true o false/,
  );
});

test("active to inactive cancels route but preserves position, facing, and point index", () => {
  const fixture = createFixture([
    actor("player"),
    actor("dog", patrol("dog_run", true)),
  ], { dog_run: true });
  reconcile(fixture);
  advanceCharacterRuntime(fixture.actorsRuntime.dog, 0.1, 100);
  const position = { ...fixture.actorsRuntime.dog.position };
  const facing = fixture.actorsRuntime.dog.facing;
  const nextPointIndex = fixture.actorsRuntime.dog.autonomousMovement.nextPointIndex;

  fixture.gameState.flags.dog_run = false;
  assert.equal(reconcile(fixture), "stop");

  assert.deepEqual(fixture.actorsRuntime.dog.position, position);
  assert.equal(fixture.actorsRuntime.dog.facing, facing);
  assert.equal(
    fixture.actorsRuntime.dog.autonomousMovement.nextPointIndex,
    nextPointIndex,
  );
  assert.equal(fixture.actorsRuntime.dog.motion, "idle");
  assert.equal(fixture.actorsRuntime.dog.destination, null);
  assert.deepEqual(fixture.actorsRuntime.dog.route, []);
});

test("inactive to active recalculates from runtime position without teleporting", () => {
  const fixture = createFixture([
    actor("player"),
    actor("dog", patrol("dog_run", true)),
  ], { dog_run: true });
  reconcile(fixture);
  advanceCharacterRuntime(fixture.actorsRuntime.dog, 0.1, 100);
  fixture.gameState.flags.dog_run = false;
  reconcile(fixture);
  const stoppedPosition = { ...fixture.actorsRuntime.dog.position };
  const stoppedIndex = fixture.actorsRuntime.dog.autonomousMovement.nextPointIndex;

  fixture.gameState.flags.dog_run = true;
  assert.equal(reconcile(fixture), "start");

  assert.deepEqual(fixture.actorsRuntime.dog.position, stoppedPosition);
  assert.equal(
    fixture.actorsRuntime.dog.autonomousMovement.nextPointIndex,
    stoppedIndex,
  );
  assert.notEqual(fixture.actorsRuntime.dog.destination, null);
  assert.deepEqual(
    fixture.actorsRuntime.dog.route.at(-1),
    fixture.model.actors[1].movement.points[stoppedIndex],
  );
});

test("conditional patrol changes never alter the controlled actor", () => {
  const fixture = createFixture([
    actor("player"),
    actor("dog", patrol("dog_run", true)),
  ], { dog_run: true });
  const playerBefore = structuredClone(fixture.actorsRuntime.player);
  reconcile(fixture);
  fixture.gameState.flags.dog_run = false;
  reconcile(fixture);

  assert.deepEqual(fixture.actorsRuntime.player, playerBefore);
});

test("two autonomous actors evaluate independent flag conditions", () => {
  const fixture = createFixture([
    actor("player"),
    actor("dog", patrol("dog_run", true)),
    actor("cat", patrol("cat_run", true)),
  ], { dog_run: true, cat_run: false });

  assert.equal(reconcile(fixture, "dog"), "start");
  assert.equal(reconcile(fixture, "cat"), "none");
  fixture.gameState.flags.dog_run = false;
  fixture.gameState.flags.cat_run = true;
  assert.equal(reconcile(fixture, "dog"), "stop");
  assert.equal(reconcile(fixture, "cat"), "start");
});

test("visual variant and conditional patrol react independently to the same flag", () => {
  const dogVariants = [{
    when: { flag: "dog_fed", value: true },
    states: {
      idle: { asset: "assets/dog-fed.svg" },
      walking: { asset: "assets/dog-fed.svg" },
    },
  }];
  const fixture = createFixture([
    actor("player"),
    actor("dog", patrol("dog_fed", false), { variants: dogVariants }),
  ], { dog_fed: false });
  const dog = fixture.model.actors[1];
  const baseVisual = resolveActorEffectiveVisual(dog, fixture.gameState);
  reconcile(fixture);
  advanceCharacterRuntime(fixture.actorsRuntime.dog, 0.1, 100);
  const position = { ...fixture.actorsRuntime.dog.position };

  fixture.gameState.flags.dog_fed = true;
  assert.equal(reconcile(fixture), "stop");
  const fedVisual = resolveActorEffectiveVisual(dog, fixture.gameState);

  assert.notEqual(fedVisual, baseVisual);
  assert.deepEqual(fixture.actorsRuntime.dog.position, position);
  assert.equal(fixture.actorsRuntime.dog.motion, "idle");
});

for (const source of ["hotspot", "actor interaction"]) {
  test(`a ${source} flag effect can stop and resume patrol`, () => {
    const extras = {
      hotspots: [{
        id: "switch",
        area: { x: 10, y: 10, width: 20, height: 20 },
        effects: [{ toggle_flag: "dog_run" }],
      }],
    };
    const fixture = createFixture([
      actor("player"),
      actor("dog", patrol("dog_run", true), {
        interactions: {
          approach_distance: 0,
          effects: [{ toggle_flag: "dog_run" }],
        },
      }),
    ], { dog_run: true }, extras);
    const effects = source === "hotspot"
      ? fixture.model.hotspots[0].effects
      : fixture.model.actors[1].interactions.effects;
    reconcile(fixture);

    applyFlagEffects(fixture.gameState, effects);
    assert.equal(reconcile(fixture), "stop");
    applyFlagEffects(fixture.gameState, effects);
    assert.equal(reconcile(fixture), "start");
  });
}
