import assert from "node:assert/strict";
import test from "node:test";
import { calculateHotspotApproachRoute } from "../hotspot-interaction.js";
import {
  availableSceneObjects,
  clearSceneObjectInteraction,
  completePendingSceneObject,
  createSceneObjectInteractionRuntime,
  selectSceneObject,
  setPendingSceneObject,
  synchronizeSceneObjectSelection,
} from "../scene-object-runtime.js";
import { renderNearbyObjects } from "../scene-object-view.js";
import { sceneObjectIsAvailable } from "../scene-object-availability.js";
import {
  beginActorInteraction,
  beginFreeNavigation,
  beginNormalHotspotInteraction,
  hotspotActivationTarget,
} from "../scene-object-coordination.js";

function model() {
  return {
    objects: [
      {
        id: "brass_key",
        name: "Llave",
        elementId: "brass_key_element",
        hotspotId: "key_hotspot",
        locationId: "table",
      },
      {
        id: "drawer",
        name: "Cajón",
        elementId: "drawer_element",
        hotspotId: "drawer_hotspot",
        locationId: "table",
      },
      {
        id: "door",
        name: "Puerta",
        elementId: "door_element",
        hotspotId: "door_hotspot",
        locationId: "doorway",
      },
    ],
    elements: [
      { id: "brass_key_element", visibleWhen: { flag: "key_visible", value: true } },
      { id: "drawer_element", visibleWhen: null },
      { id: "door_element", visibleWhen: null },
    ],
    hotspots: [
      { id: "key_hotspot", enabledWhen: { flag: "key_enabled", value: true } },
      { id: "drawer_hotspot", enabledWhen: null },
      { id: "door_hotspot", enabledWhen: null },
    ],
  };
}

function state() {
  return {
    inventory: [],
    flags: { key_visible: true, key_enabled: true },
  };
}

function viewFixture() {
  const buttons = [];
  const ownerDocument = {
    createElement() {
      const listeners = {};
      return {
        dataset: {},
        attributes: {},
        addEventListener(type, listener) { listeners[type] = listener; },
        setAttribute(name, value) { this.attributes[name] = value; },
        click() { listeners.click(); },
      };
    },
  };
  return {
    panel: { hidden: true },
    buttons,
    container: {
      ownerDocument,
      replaceChildren(...children) {
        buttons.splice(0, buttons.length, ...children);
      },
    },
  };
}

test("object approach remains pending and opens no nearby panel before arrival", () => {
  const runtime = createSceneObjectInteractionRuntime();
  setPendingSceneObject(runtime, "brass_key");

  assert.deepEqual(runtime, {
    pendingObjectId: "brass_key",
    activeLocationId: null,
    selectedObjectId: null,
  });
  assert.deepEqual(availableSceneObjects(model(), state(), runtime), []);
});

test("arrival activates the location and initially selects the reached object", () => {
  const runtime = createSceneObjectInteractionRuntime();
  setPendingSceneObject(runtime, "brass_key");

  const sceneModel = model();
  const reached = completePendingSceneObject(runtime, sceneModel, state());

  assert.equal(reached.id, "brass_key");
  assert.deepEqual(runtime, {
    pendingObjectId: null,
    activeLocationId: "table",
    selectedObjectId: "brass_key",
  });
});

test("nearby objects contain only the active location and current availability", () => {
  const sceneModel = model();
  const gameState = state();
  const runtime = createSceneObjectInteractionRuntime();
  setPendingSceneObject(runtime, "brass_key");
  completePendingSceneObject(runtime, sceneModel, gameState);

  assert.deepEqual(
    availableSceneObjects(sceneModel, gameState, runtime).map((object) => object.id),
    ["brass_key", "drawer"],
  );
  gameState.flags.key_visible = false;
  assert.deepEqual(
    availableSceneObjects(sceneModel, gameState, runtime).map((object) => object.id),
    ["drawer"],
  );
  gameState.flags.key_visible = true;
  gameState.flags.key_enabled = false;
  assert.deepEqual(
    availableSceneObjects(sceneModel, gameState, runtime).map((object) => object.id),
    ["drawer"],
  );
});

test("selecting another nearby object changes only selectedObjectId", () => {
  const sceneModel = model();
  const gameState = state();
  const runtime = {
    pendingObjectId: null,
    activeLocationId: "table",
    selectedObjectId: "brass_key",
  };
  const runtimeBefore = structuredClone(runtime);
  const modelBefore = structuredClone(sceneModel);
  const stateBefore = structuredClone(gameState);
  const available = availableSceneObjects(sceneModel, gameState, runtime);

  selectSceneObject(runtime, "drawer", available);

  assert.deepEqual(runtime, { ...runtimeBefore, selectedObjectId: "drawer" });
  assert.deepEqual(sceneModel, modelBefore);
  assert.deepEqual(gameState, stateBefore);
});

test("a disappearing selected object clears selection but preserves location", () => {
  const sceneModel = model();
  const gameState = state();
  const runtime = {
    pendingObjectId: null,
    activeLocationId: "table",
    selectedObjectId: "brass_key",
  };
  gameState.flags.key_enabled = false;

  const available = availableSceneObjects(sceneModel, gameState, runtime);
  synchronizeSceneObjectSelection(runtime, available);

  assert.equal(runtime.activeLocationId, "table");
  assert.equal(runtime.selectedObjectId, null);
  assert.deepEqual(available.map((object) => object.id), ["drawer"]);
});

test("normal rerenders preserve a valid object context", () => {
  const sceneModel = model();
  const gameState = state();
  const runtime = {
    pendingObjectId: null,
    activeLocationId: "table",
    selectedObjectId: "brass_key",
  };

  synchronizeSceneObjectSelection(
    runtime,
    availableSceneObjects(sceneModel, gameState, runtime),
  );

  assert.deepEqual(runtime, {
    pendingObjectId: null,
    activeLocationId: "table",
    selectedObjectId: "brass_key",
  });
});

test("real free-navigation orchestration clears context before starting movement", () => {
  const runtime = {
    pendingObjectId: null,
    activeLocationId: "table",
    selectedObjectId: "brass_key",
  };
  let movementStarted = false;

  beginFreeNavigation(runtime, () => {
    assert.deepEqual(runtime, createSceneObjectInteractionRuntime());
    movementStarted = true;
  });

  assert.equal(movementStarted, true);
});

test("real actor and normal-hotspot orchestration clear context before interaction", () => {
  for (const [source, beginInteraction] of [
    ["actor", beginActorInteraction],
    ["hotspot", beginNormalHotspotInteraction],
  ]) {
    const runtime = {
      pendingObjectId: "brass_key",
      activeLocationId: "table",
      selectedObjectId: "brass_key",
    };
    let interactionStarted = false;
    beginInteraction(runtime, () => {
      assert.deepEqual(runtime, createSceneObjectInteractionRuntime(), source);
      interactionStarted = true;
    });
    assert.equal(interactionStarted, true, source);
  }
});

test("an unreachable object approach leaves no active or pending context", () => {
  const runtime = {
    pendingObjectId: null,
    activeLocationId: "table",
    selectedObjectId: "brass_key",
  };
  clearSceneObjectInteraction(runtime);

  assert.throws(
    () => calculateHotspotApproachRoute(
      null,
      { x: 0, y: 0 },
      { id: "key_hotspot", approach: { x: 100, y: 100 } },
      state(),
    ),
    /requiere una red walk/,
  );
  assert.deepEqual(runtime, createSceneObjectInteractionRuntime());
});

test("scene-object availability requires both visible element and enabled hotspot", () => {
  const sceneModel = model();
  const gameState = state();
  const sceneObject = sceneModel.objects[0];

  assert.equal(sceneObjectIsAvailable(sceneObject, sceneModel, gameState), true);
  gameState.flags.key_visible = false;
  assert.equal(sceneObjectIsAvailable(sceneObject, sceneModel, gameState), false);
  gameState.flags.key_visible = true;
  gameState.flags.key_enabled = false;
  assert.equal(sceneObjectIsAvailable(sceneObject, sceneModel, gameState), false);
});

test("an object disappearing during approach clears all context at arrival", () => {
  const sceneModel = model();
  const gameState = state();
  const runtime = createSceneObjectInteractionRuntime();
  setPendingSceneObject(runtime, "brass_key");
  gameState.flags.key_visible = false;

  assert.throws(
    () => completePendingSceneObject(runtime, sceneModel, gameState),
    /objeto brass_key ya no está disponible/,
  );
  assert.deepEqual(runtime, createSceneObjectInteractionRuntime());

  setPendingSceneObject(runtime, "brass_key");
  gameState.flags.key_visible = true;
  gameState.flags.key_enabled = false;
  assert.throws(
    () => completePendingSceneObject(runtime, sceneModel, gameState),
    /objeto brass_key ya no está disponible/,
  );
  assert.deepEqual(runtime, createSceneObjectInteractionRuntime());
});

test("scene-object hotspot activation has priority over inherited effects and item use", () => {
  const sceneModel = model();
  sceneModel.hotspots[0].effects = [{ type: "give_item", itemId: "brass_key" }];
  sceneModel.useInteraction = {
    itemId: "key",
    targetType: "hotspot",
    targetId: "key_hotspot",
    effects: [{ type: "set_flag", flag: "opened" }],
  };

  const target = hotspotActivationTarget(sceneModel, "key_hotspot");

  assert.equal(target.type, "scene-object");
  assert.equal(target.sceneObject.id, "brass_key");
  assert.notEqual(target.type, "hotspot");
});

test("nearby panel is hidden before arrival and renders accessible selected buttons after arrival", () => {
  const fixture = viewFixture();
  const selections = [];
  renderNearbyObjects(fixture.panel, fixture.container, [], null, () => {});
  assert.equal(fixture.panel.hidden, true);

  const available = model().objects.slice(0, 2);
  renderNearbyObjects(
    fixture.panel,
    fixture.container,
    available,
    "brass_key",
    (objectId) => selections.push(objectId),
  );
  assert.equal(fixture.panel.hidden, false);
  assert.deepEqual(fixture.buttons.map((button) => button.textContent), ["Llave", "Cajón"]);
  assert.deepEqual(
    fixture.buttons.map((button) => button.attributes["aria-pressed"]),
    ["true", "false"],
  );
  fixture.buttons[1].click();
  assert.deepEqual(selections, ["drawer"]);
});
