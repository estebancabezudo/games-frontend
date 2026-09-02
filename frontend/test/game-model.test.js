import assert from "node:assert/strict";
import test from "node:test";
import { createActorsRuntime } from "../actors-runtime.js";
import { createGameModel, initialSceneModel } from "../game-model.js";
import { createGameState } from "../game-state.js";
import { createItemCatalog } from "../item-model.js";
import { applyFlagEffects, createFlagEffects } from "../flag-effects.js";

function scene(id, overrides = {}) {
  return {
    id,
    viewport: { orientation: "portrait" },
    size: { width: 1080, height: 1920 },
    background: { color: "#dddddd" },
    ...overrides,
  };
}

function documentWithScenes(scenes, initialScene = scenes[0]?.id) {
  return {
    game: { id: "example", initial_scene: initialScene },
    items: [{ id: "key" }],
    state: { inventory: [], flags: { power_on: false } },
    scenes,
  };
}

function model(document) {
  const items = createItemCatalog(document.items);
  const gameState = createGameState(document, items);
  return createGameModel(document, gameState, items);
}

function actor(id, extras = {}) {
  return {
    id,
    asset: "assets/player.svg",
    position: { x: 500, y: 1000 },
    size: { width: 100, height: 200 },
    ...extras,
  };
}

test("creates a game with one scene and selects initial_scene", () => {
  const game = model(documentWithScenes([scene("kitchen")]));
  assert.equal(game.id, "example");
  assert.equal(game.initialSceneId, "kitchen");
  assert.equal(game.scenes.length, 1);
  assert.equal(initialSceneModel(game).sceneId, "kitchen");
  assert.deepEqual(game.initialState, { inventory: [], flags: { power_on: false } });
});

test("initialState preserves and, or, and chained computed flag definitions", () => {
  const document = documentWithScenes([scene("kitchen")]);
  document.state.flags = {
    electricity_on: true,
    light_switch_on: false,
    light_on: "electricity_on and light_switch_on",
    battery_on: false,
    emergency_light_on: "battery_on or electricity_on",
    room_ready: "light_on or emergency_light_on",
  };
  const items = createItemCatalog(document.items);
  const gameState = createGameState(document, items);
  const game = createGameModel(document, gameState, items);

  assert.equal(game.initialState.flags.light_on, false);
  assert.equal(game.initialState.flags.emergency_light_on, true);
  assert.equal(game.initialState.flags.room_ready, true);

  game.initialState.flags.light_switch_on = true;
  assert.equal(game.initialState.flags.light_on, true);
  assert.equal(game.initialState.flags.room_ready, true);
});

test("initialState flags are independent from the original gameState", () => {
  const document = documentWithScenes([scene("kitchen")]);
  document.state.flags = {
    electricity_on: true,
    light_switch_on: false,
    light_on: "electricity_on and light_switch_on",
  };
  const items = createItemCatalog(document.items);
  const gameState = createGameState(document, items);
  const game = createGameModel(document, gameState, items);

  game.initialState.flags.light_switch_on = true;
  assert.equal(game.initialState.flags.light_on, true);
  assert.equal(gameState.flags.light_switch_on, false);
  assert.equal(gameState.flags.light_on, false);

  gameState.flags.electricity_on = false;
  assert.equal(game.initialState.flags.electricity_on, true);
  assert.equal(game.initialState.flags.light_on, true);
});

test("initialState keeps computed flags protected during validation and runtime", () => {
  const document = documentWithScenes([scene("kitchen")]);
  document.state.flags = {
    electricity_on: true,
    light_switch_on: false,
    light_on: "electricity_on and light_switch_on",
  };
  const game = model(document);

  assert.throws(
    () => createFlagEffects(
      [{ set_flag: "light_on" }],
      game.initialState,
      "effects",
    ),
    /set_flag.*flag calculado: light_on/,
  );
  assert.throws(
    () => applyFlagEffects(
      game.initialState,
      [{ type: "toggle_flag", flag: "light_on" }],
    ),
    /toggle_flag.*flag calculado: light_on/,
  );
});

test("initialState copies legacy boolean flags independently", () => {
  const document = documentWithScenes([scene("kitchen")]);
  document.state.flags = { power_on: false, door_open: true };
  const items = createItemCatalog(document.items);
  const gameState = createGameState(document, items);
  const game = createGameModel(document, gameState, items);

  assert.deepEqual(game.initialState.flags, { power_on: false, door_open: true });
  game.initialState.flags.power_on = true;
  assert.equal(gameState.flags.power_on, false);
});

test("creates and validates two independent scene models", () => {
  const game = model(documentWithScenes([scene("kitchen"), scene("hallway")], "hallway"));
  assert.deepEqual(game.scenes.map(({ sceneId }) => sceneId), ["kitchen", "hallway"]);
  assert.equal(initialSceneModel(game).sceneId, "hallway");
});

test("rejects duplicate, empty, or missing scenes and invalid initial_scene", () => {
  assert.throws(
    () => model(documentWithScenes([scene("room"), scene("room")])),
    /id duplicado: room/,
  );
  assert.throws(
    () => model(documentWithScenes([])),
    /scenes debe ser una lista no vacía/,
  );
  assert.throws(
    () => model(documentWithScenes([scene("")])),
    /scenes\[0\].*id.*texto no vacío/,
  );
  assert.throws(
    () => model(documentWithScenes([scene("room")], "missing")),
    /initial_scene.*escena existente: missing/,
  );
  const missingInitial = documentWithScenes([scene("room")]);
  delete missingInitial.game.initial_scene;
  assert.throws(() => model(missingInitial), /game\.initial_scene debe ser un texto no vacío/);
});

test("identifies the index and id of an invalid scene", () => {
  const invalid = scene("hallway");
  delete invalid.background;
  assert.throws(
    () => model(documentWithScenes([scene("kitchen"), invalid])),
    /scenes\[1\] \(hallway\) es inválida: background\.color/,
  );
});

test("global items and flags are available to every scene", () => {
  const withReferences = (id) => scene(id, {
    elements: [{
      id: `${id}_light`, x: 0, y: 0, width: 10, height: 10, color: "#fff",
      visible_when: { flag: "power_on", value: true },
    }],
    hotspots: [{
      id: `${id}_key`,
      area: { x: 0, y: 0, width: 10, height: 10 },
      effects: [{ give_item: "key" }],
    }],
  });
  const game = model(documentWithScenes([
    withReferences("kitchen"),
    withReferences("hallway"),
  ]));
  assert.equal(game.scenes[0].items, game.items);
  assert.equal(game.scenes[1].items, game.items);
  assert.equal(game.scenes[1].elements[0].visibleWhen.flag, "power_on");
});

test("dialogues cannot refer to actors from another scene", () => {
  const kitchen = scene("kitchen", {
    controlled_actor: "player",
    actors: [actor("player")],
    dialogues: [{ id: "other", lines: [{ actor: "dog", text: "Hola" }] }],
  });
  const hallway = scene("hallway", {
    controlled_actor: "dog",
    actors: [actor("dog")],
  });
  assert.throws(
    () => model(documentWithScenes([kitchen, hallway])),
    /scenes\[0\].*actor inexistente: dog/,
  );
});

test("rejects the removed proximity DSL property", () => {
  const kitchen = scene("kitchen", {
    proximity: [{
      id: "old_trigger",
      actors: ["player", "dog"],
      distance: 100,
      effects: [{ set_flag: "power_on" }],
    }],
  });
  assert.throws(
    () => model(documentWithScenes([kitchen])),
    /proximity ya no está soportado por el DSL/,
  );
});

test("interactions resolve targets only inside their scene", () => {
  const kitchen = scene("kitchen", {
    controlled_actor: "player",
    actors: [actor("player")],
    interaction: {
      use: { item: "key", on: "door" },
      effects: [{ set_flag: "power_on" }],
    },
  });
  const hallway = scene("hallway", {
    hotspots: [{ id: "door", area: { x: 0, y: 0, width: 10, height: 10 } }],
  });
  assert.throws(
    () => model(documentWithScenes([kitchen, hallway])),
    /scenes\[0\].*hotspot: door/,
  );

  kitchen.interaction.use = { item: "key", on_actor: "dog" };
  hallway.controlled_actor = "dog";
  hallway.actors = [actor("dog", { interactions: { approach_distance: 0 } })];
  assert.throws(
    () => model(documentWithScenes([kitchen, hallway])),
    /scenes\[0\].*actor: dog/,
  );
});

test("walk arrival actions resolve dialogues only inside their scene", () => {
  const kitchen = scene("kitchen", {
    walk: {
      nodes: [{
        id: "door", x: 0, y: 1000,
        on_arrival: { effects: [{ start_dialogue: "hallway_dialogue" }] },
      }],
      paths: [],
    },
  });
  const hallway = scene("hallway", {
    controlled_actor: "player",
    actors: [actor("player")],
    dialogues: [{
      id: "hallway_dialogue", lines: [{ actor: "player", text: "Hola" }],
    }],
  });
  assert.throws(
    () => model(documentWithScenes([kitchen, hallway])),
    /scenes\[0\].*diálogo inexistente: hallway_dialogue/,
  );
});

test("only the selected initial scene receives actor runtimes", () => {
  const first = scene("yard", {
    controlled_actor: "player",
    actors: [actor("player")],
  });
  const second = scene("house", {
    controlled_actor: "other_player",
    actors: [actor("other_player"), actor("dog", {
      movement: { type: "patrol", points: [{ x: 400, y: 1000 }, { x: 600, y: 1000 }] },
    })],
  });
  const game = model(documentWithScenes([first, second], "yard"));
  const active = initialSceneModel(game);
  const runtimes = createActorsRuntime(active.actors, active.size, active.depthScale);
  assert.deepEqual(Object.keys(runtimes), ["player"]);
  assert.equal(runtimes.dog, undefined);
  assert.ok(!Object.hasOwn(game.scenes[1], "actorsRuntime"));
});

test("normalizes the legacy single-scene format", () => {
  const document = {
    game: { id: "legacy" },
    scene: { id: "old_room" },
    viewport: { orientation: "landscape" },
    size: { width: 1920, height: 1080 },
    background: { color: "#ccc" },
    items: [],
    state: { inventory: [], flags: {} },
  };
  const game = model(document);
  assert.equal(game.initialSceneId, "old_room");
  assert.equal(game.scenes.length, 1);
  assert.equal(game.scenes[0].sceneId, "old_room");
  assert.equal(game.scenes[0].orientation, "landscape");
});

test("rejects mixing legacy scene with scenes", () => {
  const document = documentWithScenes([scene("new_room")]);
  document.scene = { id: "old_room" };
  assert.throws(() => model(document), /scene y scenes al mismo tiempo/);
});

test("allows change_scene from hotspots and final walk-node arrival", () => {
  const yard = scene("yard", {
    hotspots: [{
      id: "door",
      area: { x: 0, y: 0, width: 10, height: 10 },
      effects: [{ change_scene: "house" }],
    }],
    walk: {
      nodes: [
        { id: "a", x: 0, y: 1000 },
        {
          id: "b", x: 500, y: 1000,
          on_arrival: { effects: [{ change_scene: "house" }] },
        },
      ],
      paths: [{ from: "a", to: "b" }],
    },
  });
  const game = model(documentWithScenes([yard, scene("house")]));
  assert.deepEqual(game.scenes[0].hotspots[0].effects, [
    { type: "change_scene", sceneId: "house", entryId: null },
  ]);
  assert.deepEqual(game.scenes[0].walk.nodes[1].onArrival.actions, [
    { type: "change_scene", sceneId: "house", entryId: null },
  ]);
});

test("validates change_scene entries against the destination scene", () => {
  const yard = scene("yard", {
    controlled_actor: "player",
    actors: [actor("player")],
    entries: [{ id: "shared", position: { x: 100, y: 100 } }],
    hotspots: [{
      id: "door", area: { x: 0, y: 0, width: 10, height: 10 },
      effects: [{ change_scene: { scene: "house", entry: "shared" } }],
    }],
  });
  const house = scene("house", {
    controlled_actor: "player",
    actors: [actor("player")],
    entries: [{ id: "from_yard", position: { x: 200, y: 300 } }],
  });
  assert.throws(
    () => model(documentWithScenes([yard, house])),
    /entrada inexistente en house: shared/,
  );
  yard.hotspots[0].effects[0].change_scene.entry = "from_yard";
  const game = model(documentWithScenes([yard, house]));
  assert.deepEqual(game.scenes[0].hotspots[0].effects[0], {
    type: "change_scene", sceneId: "house", entryId: "from_yard",
  });
});

test("rejects change_scene from actor interactions", () => {
  const withActorInteraction = scene("yard", {
    controlled_actor: "player",
    actors: [
      actor("player"),
      actor("dog", {
        interactions: {
          approach_distance: 100,
          effects: [{ change_scene: "house" }],
        },
      }),
    ],
  });
  assert.throws(
    () => model(documentWithScenes([withActorInteraction, scene("house")])),
    /actors\[1\].interactions.effects.*change_scene no está permitido/,
  );
});

test("rejects change_scene to an unknown scene during model creation", () => {
  const yard = scene("yard", {
    hotspots: [{
      id: "door",
      area: { x: 0, y: 0, width: 10, height: 10 },
      effects: [{ change_scene: "missing" }],
    }],
  });
  assert.throws(
    () => model(documentWithScenes([yard, scene("house")])),
    /change_scene refiere a una escena inexistente: missing/,
  );
});
