import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateActorApproachPoint,
  calculateActorApproachRoute,
} from "../actor-interaction.js";
import { createActorsRuntime } from "../actors-runtime.js";
import { applyFlagEffects } from "../flag-effects.js";
import {
  cancelPendingInteraction,
  capturedItemForTarget,
  createInteractionRuntime,
  resolvePendingInteraction,
  setPendingInteraction,
} from "../interaction-runtime.js";
import { createSceneModel } from "../scene-model.js";
import { actorRectangleToPercent } from "../scene-renderer.js";
import { createWalkModel } from "../walk-model.js";

function actor(id, x, y, interactions) {
  return {
    id,
    asset: `assets/${id}.svg`,
    position: { x, y },
    size: { width: 200, height: 300 },
    ...(interactions === undefined ? {} : { interactions }),
  };
}

function sceneDocument(dogInteractions) {
  return {
    game: { id: "example" },
    scene: { id: "room" },
    viewport: { orientation: "portrait" },
    size: { width: 3000, height: 1920 },
    background: { color: "#dddddd" },
    controlled_actor: "player",
    actors: [
      actor("player", 500, 1000),
      actor("dog", 2200, 1050, dogInteractions),
    ],
  };
}

function horizontalWalk() {
  return createWalkModel({
    nodes: [
      { id: "left", x: 0, y: 1000 },
      { id: "right", x: 3000, y: 1000 },
    ],
    paths: [{ from: "left", to: "right" }],
  });
}

test("an actor without interactions remains non-interactive", () => {
  const model = createSceneModel(sceneDocument(), { inventory: [], flags: {} });

  assert.equal(model.actors[1].interactions, null);
});

test("parses an interactive actor and its valid approach distance", () => {
  const state = { inventory: [], flags: { dog_angry: false } };
  const model = createSceneModel(sceneDocument({
    approach_distance: 180,
    effects: [{ toggle_flag: "dog_angry" }],
  }), state);

  assert.deepEqual(model.actors[1].interactions, {
    approachDistance: 180,
    effects: [{ type: "toggle_flag", flag: "dog_angry" }],
    variants: [],
  });
});

function sceneWithInteractionVariants(variants) {
  const document = sceneDocument({
    approach_distance: 180,
    effects: [{ start_dialogue: "dog_warning" }],
    variants,
  });
  document.dialogues = [
    {
      id: "dog_warning",
      lines: [{ actor: "dog", text: "Grrrr..." }],
    },
    {
      id: "dog_friendly",
      lines: [{ actor: "dog", text: "Gracias." }],
    },
  ];
  return document;
}

function fedVariant() {
  return {
    when: { flag: "dog_fed", value: true },
    effects: [{ start_dialogue: "dog_friendly" }],
  };
}

test("actor interaction keeps base effects when no variant is active", () => {
  const state = { inventory: [], flags: { dog_fed: false } };
  const model = createSceneModel(sceneWithInteractionVariants([fedVariant()]), state);
  const actorsRuntime = createActorsRuntime(model.actors, model.size, model.depthScale);

  const resolved = resolvePendingInteraction(
    { targetType: "actor", targetId: "dog", itemId: null },
    model,
    null,
    state,
    actorsRuntime,
  );

  assert.deepEqual(resolved.effects, [{
    type: "start_dialogue",
    dialogueId: "dog_warning",
  }]);
});

test("actor interaction resolves its active variant using state at arrival", () => {
  const state = { inventory: [], flags: { dog_fed: false } };
  const model = createSceneModel(sceneWithInteractionVariants([fedVariant()]), state);
  const actorsRuntime = createActorsRuntime(model.actors, model.size, model.depthScale);
  state.flags.dog_fed = true;

  const resolved = resolvePendingInteraction(
    { targetType: "actor", targetId: "dog", itemId: null },
    model,
    null,
    state,
    actorsRuntime,
  );

  assert.deepEqual(resolved.effects, [{
    type: "start_dialogue",
    dialogueId: "dog_friendly",
  }]);
});

test("actor interaction rejects more than one active variant and identifies the actor", () => {
  const state = { inventory: [], flags: { dog_fed: true } };
  const model = createSceneModel(
    sceneWithInteractionVariants([fedVariant(), fedVariant()]),
    state,
  );
  const actorsRuntime = createActorsRuntime(model.actors, model.size, model.depthScale);

  assert.throws(
    () => resolvePendingInteraction(
      { targetType: "actor", targetId: "dog", itemId: null },
      model,
      null,
      state,
      actorsRuntime,
    ),
    /actor dog.*más de una variante de interacción activa/,
  );
});

test("actor interaction variants validate their structure and known properties", () => {
  const state = { inventory: [], flags: { dog_fed: false } };
  assert.throws(
    () => createSceneModel(sceneWithInteractionVariants({}), state),
    /interactions\.variants debe ser una lista/,
  );
  assert.throws(
    () => createSceneModel(sceneWithInteractionVariants([null]), state),
    /interactions\.variants\[0\] debe ser un objeto/,
  );
  assert.throws(
    () => createSceneModel(sceneWithInteractionVariants([{
      ...fedVariant(),
      priority: 1,
    }]), state),
    /propiedades desconocidas: priority/,
  );
  assert.throws(
    () => createSceneModel(sceneWithInteractionVariants([{
      when: { flag: "dog_fed", value: true },
    }]), state),
    /debe declarar exactamente when y effects/,
  );
});

test("actor interaction variants reuse flag and action validation", () => {
  const state = { inventory: [], flags: { dog_fed: false } };
  assert.throws(
    () => createSceneModel(sceneWithInteractionVariants([{
      when: { flag: "missing", value: true },
      effects: [{ start_dialogue: "dog_friendly" }],
    }]), state),
    /flag no declarado: missing/,
  );
  assert.throws(
    () => createSceneModel(sceneWithInteractionVariants([{
      when: { flag: "dog_fed", value: "yes" },
      effects: [{ start_dialogue: "dog_friendly" }],
    }]), state),
    /value debe ser true o false/,
  );
  assert.throws(
    () => createSceneModel(sceneWithInteractionVariants([{
      when: { flag: "dog_fed", value: true },
      effects: [{ dance: "dog" }],
    }]), state),
    /debe usar set_flag.*start_dialogue/,
  );
  assert.throws(
    () => createSceneModel(sceneWithInteractionVariants([{
      when: { flag: "dog_fed", value: true },
      effects: [{ start_dialogue: "missing" }],
    }]), state),
    /diálogo inexistente: missing/,
  );
});

test("inventory actor interaction has absolute priority over generic variants", () => {
  const state = { inventory: ["dog_food"], flags: { dog_fed: true } };
  const model = createSceneModel(
    sceneWithInteractionVariants([fedVariant(), fedVariant()]),
    state,
  );
  const actorsRuntime = createActorsRuntime(model.actors, model.size, model.depthScale);
  const useInteraction = {
    itemId: "dog_food",
    targetType: "actor",
    targetId: "dog",
    effects: [{ type: "clear_flag", flag: "dog_fed" }],
  };

  const resolved = resolvePendingInteraction(
    { targetType: "actor", targetId: "dog", itemId: "dog_food" },
    model,
    useInteraction,
    state,
    actorsRuntime,
  );

  assert.deepEqual(resolved.effects, [{ type: "clear_flag", flag: "dog_fed" }]);
});

test("resolving an actor interaction does not mutate declarations or state", () => {
  const document = sceneWithInteractionVariants([fedVariant()]);
  const state = { inventory: [], flags: { dog_fed: true } };
  const model = createSceneModel(document, state);
  const actorsRuntime = createActorsRuntime(model.actors, model.size, model.depthScale);
  const documentBefore = structuredClone(document);
  const actorBefore = structuredClone(model.actors[1]);
  const stateBefore = structuredClone(state);

  resolvePendingInteraction(
    { targetType: "actor", targetId: "dog", itemId: null },
    model,
    null,
    state,
    actorsRuntime,
  );

  assert.deepEqual(document, documentBefore);
  assert.deepEqual(model.actors[1], actorBefore);
  assert.deepEqual(state, stateBefore);
});

test("rejects invalid actor approach distances", () => {
  [-1, Infinity, "near"].forEach((approachDistance) => {
    assert.throws(
      () => createSceneModel(sceneDocument({ approach_distance: approachDistance }), {
        inventory: [],
        flags: {},
      }),
      /interactions\.approach_distance/,
    );
  });
});

test("calculates an accessible point at the requested actor distance", () => {
  const approach = calculateActorApproachPoint(
    horizontalWalk(),
    { x: 500, y: 1000 },
    { x: 2200, y: 1050 },
    180,
  );

  assert.ok(Math.abs(approach.distanceFromActor - 180) < 0.000001);
  assert.ok(approach.point.x < 2200);
  assert.equal(approach.point.y, 1000);
});

test("approach distance zero uses the nearest walk projection", () => {
  const route = calculateActorApproachRoute(
    horizontalWalk(),
    { x: 500, y: 1000 },
    { x: 2200, y: 1050 },
    0,
  );

  assert.deepEqual(route.at(-1), { x: 2200, y: 1000 });
});

test("an actor effect is resolved only after arrival", () => {
  const state = { inventory: [], flags: { dog_angry: false } };
  const model = createSceneModel(sceneDocument({
    approach_distance: 180,
    effects: [{ toggle_flag: "dog_angry" }],
  }), state);
  const actorsRuntime = createActorsRuntime(model.actors, model.size, model.depthScale);
  const interactionRuntime = createInteractionRuntime();
  setPendingInteraction(interactionRuntime, "actor", "dog");

  assert.equal(state.flags.dog_angry, false);
  const resolved = resolvePendingInteraction(
    interactionRuntime.pendingInteraction,
    model,
    null,
    state,
    actorsRuntime,
  );
  applyFlagEffects(state, resolved.effects);
  assert.equal(state.flags.dog_angry, true);
});

test("an actor dialogue action is resolved only after arrival", () => {
  const state = { inventory: [], flags: {} };
  const document = sceneDocument({
    approach_distance: 180,
    effects: [{ start_dialogue: "dog_warning" }],
  });
  document.dialogues = [{
    id: "dog_warning",
    lines: [{ actor: "dog", text: "Grrrr..." }],
  }];
  const model = createSceneModel(document, state);
  const actorsRuntime = createActorsRuntime(model.actors, model.size, model.depthScale);
  const runtime = createInteractionRuntime();
  setPendingInteraction(runtime, "actor", "dog");

  const resolved = resolvePendingInteraction(
    runtime.pendingInteraction,
    model,
    null,
    state,
    actorsRuntime,
  );
  assert.deepEqual(resolved.effects, [{
    type: "start_dialogue",
    dialogueId: "dog_warning",
  }]);
});

test("an inventory interaction takes precedence over generic actor dialogue actions", () => {
  const state = { inventory: ["dog_food"], flags: { dog_fed: false } };
  const document = sceneDocument({
    approach_distance: 180,
    effects: [{ start_dialogue: "dog_warning" }],
  });
  document.dialogues = [{
    id: "dog_warning",
    lines: [{ actor: "dog", text: "Grrrr..." }],
  }];
  const model = createSceneModel(document, state);
  const actorsRuntime = createActorsRuntime(model.actors, model.size, model.depthScale);
  const useInteraction = {
    itemId: "dog_food",
    targetType: "actor",
    targetId: "dog",
    effects: [{ type: "set_flag", flag: "dog_fed" }],
  };

  const resolved = resolvePendingInteraction(
    { targetType: "actor", targetId: "dog", itemId: "dog_food" },
    model,
    useInteraction,
    state,
    actorsRuntime,
  );
  assert.deepEqual(resolved.effects, [{ type: "set_flag", flag: "dog_fed" }]);
});

test("an actor action rejects a missing dialogue reference", () => {
  assert.throws(
    () => createSceneModel(sceneDocument({
      approach_distance: 180,
      effects: [{ start_dialogue: "missing" }],
    }), { inventory: [], flags: {} }),
    /diálogo inexistente: missing/,
  );
});

test("an inventory item is captured and resolved against an actor", () => {
  const useInteraction = {
    itemId: "dog_food",
    targetType: "actor",
    targetId: "dog",
    effects: [{ type: "set_flag", flag: "dog_fed" }],
  };
  const capturedItem = capturedItemForTarget(
    "actor",
    "dog",
    "dog_food",
    useInteraction,
  );
  const runtime = createInteractionRuntime();
  setPendingInteraction(runtime, "actor", "dog", capturedItem);

  assert.deepEqual(runtime.pendingInteraction, {
    targetType: "actor",
    targetId: "dog",
    itemId: "dog_food",
  });
  assert.equal(Object.hasOwn(runtime.pendingInteraction, "position"), false);

  const state = { inventory: ["dog_food", "key"], flags: { dog_fed: false } };
  const model = createSceneModel(sceneDocument({ approach_distance: 180 }), state);
  const actorsRuntime = createActorsRuntime(model.actors, model.size, model.depthScale);
  const resolved = resolvePendingInteraction(
    runtime.pendingInteraction,
    model,
    useInteraction,
    state,
    actorsRuntime,
  );
  applyFlagEffects(state, resolved.effects);
  assert.equal(state.flags.dog_fed, true);
});

test("an incompatible captured item cannot fall back to actor effects", () => {
  const state = {
    inventory: ["key", "dog_food"],
    flags: { dog_fed: false, dog_angry: false },
  };
  const model = createSceneModel(sceneDocument({
    approach_distance: 180,
    effects: [{ toggle_flag: "dog_angry" }],
  }), state);
  const actorsRuntime = createActorsRuntime(model.actors, model.size, model.depthScale);
  const useInteraction = {
    itemId: "dog_food",
    targetType: "actor",
    targetId: "dog",
    effects: [{ type: "set_flag", flag: "dog_fed" }],
  };

  assert.throws(
    () => resolvePendingInteraction(
      { targetType: "actor", targetId: "dog", itemId: "key" },
      model,
      useInteraction,
      state,
      actorsRuntime,
    ),
    /interacción pendiente ya no es válida/,
  );
  assert.deepEqual(state.flags, { dog_fed: false, dog_angry: false });
});

test("free clicks cancel and targets replace the one global pending interaction", () => {
  const runtime = createInteractionRuntime();
  setPendingInteraction(runtime, "actor", "dog");
  setPendingInteraction(runtime, "actor", "cat");
  assert.equal(runtime.pendingInteraction.targetId, "cat");

  setPendingInteraction(runtime, "hotspot", "lever");
  assert.deepEqual(runtime.pendingInteraction, {
    targetType: "hotspot",
    targetId: "lever",
    itemId: null,
  });
  setPendingInteraction(runtime, "actor", "dog");
  assert.equal(runtime.pendingInteraction.targetType, "actor");
  cancelPendingInteraction(runtime);
  assert.equal(runtime.pendingInteraction, null);
});

test("a missing actor runtime prevents pending effects", () => {
  const state = { inventory: [], flags: { dog_angry: false } };
  const model = createSceneModel(sceneDocument({
    approach_distance: 180,
    effects: [{ toggle_flag: "dog_angry" }],
  }), state);

  assert.throws(
    () => resolvePendingInteraction(
      { targetType: "actor", targetId: "dog", itemId: null },
      model,
      null,
      state,
      {},
    ),
    /actor pendiente dog ya no existe/,
  );
  assert.equal(state.flags.dog_angry, false);
});

test("camera displacement and depth scale define the actor interactive rectangle", () => {
  const rectangle = actorRectangleToPercent(
    {
      ...actor("dog", 2200, 1050),
      position: { x: 2200, y: 1050 },
    },
    { width: 1000, height: 1920 },
    0.5,
    1500,
  );

  assert.deepEqual(rectangle, {
    left: 65,
    top: 46.875,
    width: 10,
    height: 7.8125,
  });
});
