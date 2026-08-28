import assert from "node:assert/strict";
import test from "node:test";
import { applyFlagEffects } from "../flag-effects.js";
import { createUseInteraction } from "../interaction-model.js";
import { giveInventoryItem } from "../inventory-runtime.js";
import { resolvePendingInteraction } from "../interaction-runtime.js";

const sceneModel = {
  items: [{ id: "dog_food" }, { id: "bone" }],
  hotspots: [{ id: "dog" }],
  actors: [],
  controlledActorId: null,
};
const gameState = {
  inventory: ["dog_food"],
  flags: { dog_fed: false },
};

test("creates the item-on-hotspot interaction", () => {
  const document = {
    interaction: {
      use: { item: "dog_food", on: "dog" },
      effects: [{ set_flag: "dog_fed" }],
    },
  };

  assert.deepEqual(createUseInteraction(document, sceneModel, gameState), {
    itemId: "dog_food",
    targetType: "hotspot",
    targetId: "dog",
    effects: [{ type: "set_flag", flag: "dog_fed" }],
  });
});

test("executes the common flag effect from an item interaction", () => {
  const state = {
    inventory: ["dog_food"],
    flags: { dog_fed: false },
  };
  const interaction = createUseInteraction({
    interaction: {
      use: { item: "dog_food", on: "dog" },
      effects: [{ set_flag: "dog_fed" }],
    },
  }, sceneModel, state);

  applyFlagEffects(state, interaction.effects);

  assert.equal(state.flags.dog_fed, true);
});

test("allows a known item that is not initially owned", () => {
  const interaction = createUseInteraction({
    interaction: {
      use: { item: "bone", on: "dog" },
      effects: [{ set_flag: "dog_fed" }],
    },
  }, sceneModel, gameState);
  assert.equal(interaction.itemId, "bone");
});

test("an acquired catalog item can be used by the declared interaction", () => {
  const state = { inventory: [], flags: { dog_fed: false } };
  const interaction = createUseInteraction({
    interaction: {
      use: { item: "bone", on: "dog" },
      effects: [{ set_flag: "dog_fed" }],
    },
  }, sceneModel, state);
  giveInventoryItem(state, "bone");
  const resolved = resolvePendingInteraction(
    { targetType: "hotspot", targetId: "dog", itemId: "bone" },
    sceneModel,
    interaction,
    state,
  );
  assert.deepEqual(resolved.effects, [{ type: "set_flag", flag: "dog_fed" }]);
});

test("requires the used item to exist in the catalog", () => {
  assert.throws(
    () => createUseInteraction({
      interaction: {
        use: { item: "missing", on: "dog" },
        effects: [{ set_flag: "dog_fed" }],
      },
    }, sceneModel, gameState),
    /item inexistente: missing/,
  );
});

test("requires the target to be an existing hotspot", () => {
  assert.throws(
    () => createUseInteraction({
      interaction: {
        use: { item: "dog_food", on: "cat" },
        effects: [{ set_flag: "dog_fed" }],
      },
    }, sceneModel, gameState),
    /debe identificar un hotspot: cat/,
  );
});

test("creates an item-on-actor interaction", () => {
  const actorScene = {
    items: sceneModel.items,
    hotspots: [],
    actors: [{ id: "player", interactions: null }, { id: "dog", interactions: {} }],
    controlledActorId: "player",
  };
  const interaction = createUseInteraction({
    interaction: {
      use: { item: "dog_food", on_actor: "dog" },
      effects: [{ set_flag: "dog_fed" }],
    },
  }, actorScene, gameState);

  assert.deepEqual(interaction, {
    itemId: "dog_food",
    targetType: "actor",
    targetId: "dog",
    effects: [{ type: "set_flag", flag: "dog_fed" }],
  });
});

test("rejects ambiguous, missing, controlled, and non-interactive actor targets", () => {
  const actorScene = {
    items: sceneModel.items,
    hotspots: [{ id: "dog" }],
    actors: [{ id: "player", interactions: null }, { id: "dog", interactions: {} }],
    controlledActorId: "player",
  };
  const interaction = (use) => ({
    interaction: { use: { item: "dog_food", ...use }, effects: [{ set_flag: "dog_fed" }] },
  });

  assert.throws(
    () => createUseInteraction(interaction({ on: "dog", on_actor: "dog" }), actorScene, gameState),
    /exactamente uno de on u on_actor/,
  );
  assert.throws(
    () => createUseInteraction(interaction({ on_actor: "cat" }), actorScene, gameState),
    /debe identificar un actor: cat/,
  );
  assert.throws(
    () => createUseInteraction(interaction({ on_actor: "player" }), actorScene, gameState),
    /no puede referir al controlled_actor/,
  );
  const nonInteractiveScene = {
    ...actorScene,
    actors: actorScene.actors.map((actor) => ({ ...actor, interactions: null })),
  };
  assert.throws(
    () => createUseInteraction(interaction({ on_actor: "dog" }), nonInteractiveScene, gameState),
    /debe declarar interactions/,
  );
});
