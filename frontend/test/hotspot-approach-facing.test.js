import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { calculateActorApproachRoute } from "../actor-interaction.js";
import { requestNextPatrolRoute } from "../actor-patrol.js";
import { createCharacterMovementLoop } from "../character-movement.js";
import {
  createCharacterRuntime,
  setCharacterRoute,
} from "../character-runtime.js";
import { applyGameActions } from "../game-actions.js";
import { createGameModel, initialSceneModel } from "../game-model.js";
import { createGameState } from "../game-state.js";
import {
  calculateHotspotApproachRoute,
  completeHotspotApproach,
} from "../hotspot-interaction.js";
import {
  cancelPendingInteraction,
  createInteractionRuntime,
  resolvePendingInteraction,
  setPendingInteraction,
  takePendingInteraction,
} from "../interaction-runtime.js";
import { createItemCatalog } from "../item-model.js";
import { createSceneModel } from "../scene-model.js";
import {
  completePendingSceneObject,
  createSceneObjectInteractionRuntime,
  setPendingSceneObject,
} from "../scene-object-runtime.js";
import { createWalkModel } from "../walk-model.js";
import { parseYaml } from "../yaml-parser.js";

const DIRECTIONS = {
  1: ["default"],
  2: ["left", "right"],
  4: ["up", "right", "down", "left"],
  8: [
    "up",
    "up_right",
    "right",
    "down_right",
    "down",
    "down_left",
    "left",
    "up_left",
  ],
};

function actor(directions = 4) {
  const definition = {
    id: "player",
    position: { x: 100, y: 100 },
    size: { width: 20, height: 40 },
  };
  if (directions === 1) {
    definition.asset = "assets/player.svg";
    return definition;
  }
  definition.visual = {
    directions,
    assets: Object.fromEntries(
      DIRECTIONS[directions].map((facing) => [facing, `assets/player-${facing}.svg`]),
    ),
  };
  return definition;
}

function sceneDefinition({
  directions = 4,
  facing,
  withActor = true,
  enabledWhen,
  withObject = false,
  withDialogue = false,
} = {}) {
  const approach = { x: 100, y: 100 };
  if (facing !== undefined) approach.facing = facing;
  const definition = {
    game: { id: "example" },
    scene: { id: "room" },
    viewport: { orientation: "portrait" },
    size: { width: 500, height: 500 },
    background: { color: "#ddd" },
    hotspots: [{
      id: "switch",
      area: { x: 50, y: 50, width: 50, height: 50 },
      approach,
      enabled_when: enabledWhen,
      effects: withDialogue
        ? [{ start_dialogue: "notice" }]
        : [{ set_flag: "activated" }],
    }],
  };
  if (withDialogue) {
    definition.dialogues = [{
      id: "notice",
      lines: [{ actor: "player", text: "Notice." }],
    }];
  }
  if (withActor) {
    definition.actors = [actor(directions)];
    definition.controlled_actor = "player";
  }
  if (withObject) {
    definition.elements = [{
      id: "switch_element",
      x: 50,
      y: 50,
      width: 50,
      height: 50,
      color: "#333",
    }];
    definition.objects = [{
      id: "switch_object",
      name: "Switch",
      element: "switch_element",
      hotspot: "switch",
    }];
  }
  return definition;
}

function state(overrides = {}) {
  return {
    inventory: [],
    flags: { activated: false, enabled: true, visible: true, ...overrides },
  };
}

function runtimeFor(model) {
  return createCharacterRuntime(model.character, model.size, model.depthScale);
}

function completeNormalHotspot(runtime, model, gameState, pendingRuntime, onFacingChange) {
  const pending = takePendingInteraction(pendingRuntime);
  return completeHotspotApproach(
    runtime,
    () => {
      const result = resolvePendingInteraction(pending, model, null, gameState);
      const hotspot = model.hotspots.find(({ id }) => id === pending.targetId);
      return { hotspot, result };
    },
    onFacingChange,
  );
}

test("normalizes omitted facing as null and accepts every facing for 1, 2, 4, and 8 directions", () => {
  const omitted = createSceneModel(sceneDefinition(), state());
  assert.deepEqual(omitted.hotspots[0].approach, { x: 100, y: 100, facing: null });

  Object.entries(DIRECTIONS).forEach(([directions, facings]) => {
    facings.forEach((facing) => {
      const model = createSceneModel(
        sceneDefinition({ directions: Number(directions), facing }),
        state(),
      );
      assert.equal(model.hotspots[0].approach.facing, facing);
    });
  });
});

test("rejects empty, unknown, incompatible, and actorless facing at the exact YAML path", () => {
  for (const [definition, message] of [
    [sceneDefinition({ facing: "" }), /hotspots\[0\]\.approach\.facing debe ser/],
    [sceneDefinition({ facing: 7 }), /hotspots\[0\]\.approach\.facing debe ser/],
    [sceneDefinition({ facing: "sideways" }), /hotspots\[0\]\.approach\.facing no es compatible/],
    [sceneDefinition({ directions: 2, facing: "up" }), /hotspots\[0\]\.approach\.facing no es compatible/],
    [sceneDefinition({ facing: "up", withActor: false }), /hotspots\[0\]\.approach\.facing requiere/],
  ]) {
    assert.throws(() => createSceneModel(definition, state()), message);
  }
});

test("normal hotspot applies final facing only after route completion and before effects", () => {
  const model = createSceneModel(sceneDefinition({ facing: "up" }), state());
  const gameState = state();
  const runtime = runtimeFor(model);
  runtime.position = { x: 0, y: 100 };
  const pendingRuntime = createInteractionRuntime();
  setPendingInteraction(pendingRuntime, "hotspot", "switch");
  setCharacterRoute(runtime, [{ x: 100, y: 100 }], model.size);
  const callbacks = [];
  const order = [];
  const loop = createCharacterMovementLoop(
    runtime,
    () => {},
    () => {
      const interaction = completeNormalHotspot(
        runtime,
        model,
        gameState,
        pendingRuntime,
        () => {
          order.push(`facing:${runtime.facing}`);
          assert.equal(gameState.flags.activated, false);
        },
      );
      order.push("effects");
      applyGameActions(gameState, interaction.effects);
    },
    {
      request(callback) {
        callbacks.push(callback);
        return callbacks.length;
      },
      cancel() {},
    },
  );

  loop.start();
  assert.equal(runtime.facing, "right");
  assert.equal(gameState.flags.activated, false);
  callbacks.shift()(0);
  assert.equal(runtime.facing, "right");
  callbacks.shift()(1000);

  assert.equal(runtime.facing, "up");
  assert.equal(runtime.motion, "idle");
  assert.equal(gameState.flags.activated, true);
  assert.deepEqual(order, ["facing:up", "effects"]);
});

test("final facing is visible before a dialogue action starts", () => {
  const model = createSceneModel(
    sceneDefinition({ facing: "up", withDialogue: true }),
    state(),
  );
  const gameState = state();
  const runtime = runtimeFor(model);
  runtime.facing = "left";
  const pending = createInteractionRuntime();
  setPendingInteraction(pending, "hotspot", "switch");
  const interaction = completeNormalHotspot(runtime, model, gameState, pending, () => {});

  applyGameActions(gameState, interaction.effects, {
    startDialogue(dialogueId) {
      assert.equal(dialogueId, "notice");
      assert.equal(runtime.facing, "up");
      assert.equal(runtime.motion, "idle");
    },
  });
});

test("scene object validates availability, applies facing, then exposes its location", () => {
  const model = createSceneModel(
    sceneDefinition({ facing: "left", withObject: true }),
    state(),
  );
  const gameState = state();
  const characterRuntime = runtimeFor(model);
  const objectRuntime = createSceneObjectInteractionRuntime();
  setPendingSceneObject(objectRuntime, "switch_object");
  const order = [];

  const sceneObject = completeHotspotApproach(
    characterRuntime,
    () => {
      const result = completePendingSceneObject(objectRuntime, model, gameState);
      order.push("available");
      return { hotspot: model.hotspots[0], result };
    },
    () => order.push(`facing:${characterRuntime.facing}`),
  );
  order.push("panel");

  assert.equal(sceneObject.id, "switch_object");
  assert.equal(characterRuntime.facing, "left");
  assert.equal(characterRuntime.motion, "idle");
  assert.equal(objectRuntime.activeLocationId, "switch_object");
  assert.deepEqual(order, ["available", "facing:left", "panel"]);
});

test("an empty route still applies facing, while omitted facing preserves movement-derived orientation", () => {
  const withFacing = createSceneModel(sceneDefinition({ facing: "left" }), state());
  const runtime = runtimeFor(withFacing);
  runtime.facing = "down";
  setCharacterRoute(runtime, [], withFacing.size);
  const pending = createInteractionRuntime();
  setPendingInteraction(pending, "hotspot", "switch");
  completeNormalHotspot(runtime, withFacing, state(), pending, () => {});
  assert.equal(runtime.facing, "left");

  const withoutFacing = createSceneModel(sceneDefinition(), state());
  const preserved = runtimeFor(withoutFacing);
  preserved.facing = "down";
  const pendingWithoutFacing = createInteractionRuntime();
  setPendingInteraction(pendingWithoutFacing, "hotspot", "switch");
  completeNormalHotspot(
    preserved,
    withoutFacing,
    state(),
    pendingWithoutFacing,
    () => assert.fail("renderer must not update for omitted facing"),
  );
  assert.equal(preserved.facing, "down");
});

test("cancelled, replaced, failed, and unavailable approaches never apply their declared facing", () => {
  const model = createSceneModel(sceneDefinition({ facing: "up" }), state());
  const runtime = runtimeFor(model);
  runtime.facing = "left";
  const pending = createInteractionRuntime();
  setPendingInteraction(pending, "hotspot", "switch");
  setCharacterRoute(runtime, [{ x: 200, y: 100 }], model.size);
  const cancelledLoop = createCharacterMovementLoop(
    runtime,
    () => {},
    () => {},
    {
      request() {
        return 1;
      },
      cancel() {},
    },
  );
  cancelledLoop.start();
  cancelPendingInteraction(pending);
  cancelledLoop.stop();
  assert.equal(pending.pendingInteraction, null);
  assert.equal(runtime.facing, "left");

  model.hotspots.push({
    id: "plain",
    enabledWhen: null,
    area: { x: 0, y: 0, width: 10, height: 10 },
    approach: { x: 100, y: 100, facing: null },
    effects: [],
  });
  setPendingInteraction(pending, "hotspot", "switch");
  setPendingInteraction(pending, "hotspot", "plain");
  completeNormalHotspot(runtime, model, state(), pending, () => {
    assert.fail("replacement without facing must preserve orientation");
  });
  assert.equal(runtime.facing, "left");

  assert.throws(
    () => completeHotspotApproach(runtime, () => {
      throw new Error("cancelled or failed");
    }),
    /cancelled or failed/,
  );
  assert.equal(runtime.facing, "left");

  const unavailableState = state({ enabled: false });
  const unavailable = createSceneModel(
    sceneDefinition({ facing: "up", enabledWhen: { flag: "enabled", value: true } }),
    unavailableState,
  );
  const unavailablePending = createInteractionRuntime();
  setPendingInteraction(unavailablePending, "hotspot", "switch");
  assert.throws(
    () => completeNormalHotspot(
      runtime,
      unavailable,
      unavailableState,
      unavailablePending,
      () => assert.fail("unavailable hotspot must not update facing"),
    ),
    /está deshabilitado/,
  );
  assert.equal(runtime.facing, "left");
});

test("an object disappearing before arrival and an impossible route preserve facing", () => {
  const model = createSceneModel(
    sceneDefinition({ facing: "up", withObject: true }),
    state(),
  );
  model.elements[0].visibleWhen = { flag: "visible", value: true };
  const gameState = state({ visible: false });
  const characterRuntime = runtimeFor(model);
  characterRuntime.facing = "left";
  const objectRuntime = createSceneObjectInteractionRuntime();
  setPendingSceneObject(objectRuntime, "switch_object");
  assert.throws(
    () => completeHotspotApproach(characterRuntime, () => ({
      hotspot: model.hotspots[0],
      result: completePendingSceneObject(objectRuntime, model, gameState),
    })),
    /ya no está disponible/,
  );
  assert.equal(characterRuntime.facing, "left");

  const disconnected = createWalkModel({
    nodes: [
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 100, y: 0 },
      { id: "c", x: 400, y: 0 },
      { id: "d", x: 500, y: 0 },
    ],
    paths: [{ from: "a", to: "b" }, { from: "c", to: "d" }],
  });
  assert.throws(
    () => calculateHotspotApproachRoute(
      disconnected,
      { x: 0, y: 0 },
      { id: "switch", approach: { x: 500, y: 0, facing: "up" } },
      gameState,
    ),
    /No existe una ruta/,
  );
  assert.equal(characterRuntime.facing, "left");
});

test("free movement, patrol, and actor approach do not apply hotspot final facing", () => {
  const model = createSceneModel(sceneDefinition({ facing: "up" }), state());
  const runtime = runtimeFor(model);
  runtime.facing = "right";
  const walk = createWalkModel({
    nodes: [{ id: "a", x: 0, y: 100 }, { id: "b", x: 200, y: 100 }],
    paths: [{ from: "a", to: "b" }],
  });
  calculateActorApproachRoute(walk, { x: 0, y: 100 }, { x: 200, y: 100 }, 0, state());
  assert.equal(runtime.facing, "right");

  runtime.autonomousMovement = { type: "patrol", nextPointIndex: 0, error: null };
  const patrolActor = {
    id: "npc",
    movement: {
      type: "patrol",
      enabledWhen: null,
      points: [{ x: 200, y: 100 }, { x: 0, y: 100 }],
    },
  };
  requestNextPatrolRoute(patrolActor, runtime, walk, model.size, state());
  assert.equal(runtime.facing, "right");
  assert.equal(runtime.motion, "walking");
});

test("the example declares all final facings and leaves YAML, model, and global state unchanged", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const yaml = html.match(/<textarea[^>]*id="yaml-editor"[^>]*>([\s\S]*?)<\/textarea>/)?.[1];
  const document = parseYaml(yaml);
  const items = createItemCatalog(document.items);
  const gameState = createGameState(document, items);
  const gameModel = createGameModel(document, gameState, items);
  const model = initialSceneModel(gameModel);
  const documentBefore = structuredClone(document);
  const modelBefore = structuredClone(model);
  const stateBefore = { inventory: [...gameState.inventory], flags: { ...gameState.flags } };
  const expected = {
    light_switch: "up",
    lever_switch: "up",
    brass_key_on_table: "left",
    table_surface: "left",
    table_drawer: "left",
    drawer_coin: "left",
    house_door: "up",
  };

  Object.entries(expected).forEach(([id, facing]) => {
    assert.equal(model.hotspots.find((hotspot) => hotspot.id === id).approach.facing, facing);
  });
  const tableIndex = model.hotspots.findIndex(({ id }) => id === "table_surface");
  assert.ok(tableIndex < model.hotspots.findIndex(({ id }) => id === "table_drawer"));
  assert.ok(tableIndex < model.hotspots.findIndex(({ id }) => id === "drawer_coin"));
  assert.deepEqual(document, documentBefore);
  assert.deepEqual(model, modelBefore);
  assert.deepEqual(
    { inventory: [...gameState.inventory], flags: { ...gameState.flags } },
    stateBefore,
  );
});
