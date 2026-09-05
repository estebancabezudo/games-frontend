import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  advanceDialogue,
  createDialogueRuntime,
  dialogueIsActive,
  startDialogue,
} from "../dialogue-runtime.js";
import { applyGameActions } from "../game-actions.js";
import { createGameModel, initialSceneModel } from "../game-model.js";
import { createGameState } from "../game-state.js";
import { calculateHotspotApproachRoute } from "../hotspot-interaction.js";
import { createItemCatalog } from "../item-model.js";
import { sceneObjectActionIsAvailable } from "../scene-object-action-availability.js";
import { resolveSelectedSceneObjectAction } from "../scene-object-actions.js";
import { hotspotActivationTarget } from "../scene-object-coordination.js";
import {
  availableSceneObjects,
  completePendingSceneObject,
  createSceneObjectInteractionRuntime,
  setPendingSceneObject,
} from "../scene-object-runtime.js";
import { renderNearbyObjects } from "../scene-object-view.js";
import { parseYaml } from "../yaml-parser.js";

function loadExample() {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const yaml = html.match(/<textarea[^>]*id="yaml-editor"[^>]*>([\s\S]*?)<\/textarea>/)?.[1];
  assert.ok(yaml);
  const document = parseYaml(yaml);
  const items = createItemCatalog(document.items);
  const gameState = createGameState(document, items);
  const gameModel = createGameModel(document, gameState, items);
  return {
    document,
    gameState,
    sceneModel: initialSceneModel(gameModel),
    yaml,
  };
}

function findById(values, id) {
  return values.find((value) => value.id === id);
}

function viewFixture() {
  const objectButtons = [];
  const actionButtons = [];
  const ownerDocument = {
    createElement() {
      return {
        dataset: {},
        disabled: false,
        setAttribute() {},
        addEventListener() {},
      };
    },
  };
  const container = (children) => ({
    ownerDocument,
    hidden: false,
    replaceChildren(...values) {
      children.splice(0, children.length, ...values);
    },
  });
  return {
    panel: { hidden: false },
    objectButtons,
    actionButtons,
    objectContainer: container(objectButtons),
    actionContainer: container(actionButtons),
  };
}

test("the example normalizes the table dialogue, hotspot, object, and Look action", () => {
  const { sceneModel } = loadExample();
  const dialogue = findById(sceneModel.dialogues, "table_look");
  const hotspot = findById(sceneModel.hotspots, "table_surface");
  const sceneObject = findById(sceneModel.objects, "table");

  assert.deepEqual(dialogue, {
    id: "table_look",
    lines: [{ actorId: "player", text: "Es una mesa sólida." }],
    participantIds: ["player"],
  });
  assert.deepEqual(hotspot.area, {
    x: 290,
    y: 700,
    width: 500,
    height: 350,
  });
  assert.deepEqual(hotspot.approach, { x: 1000, y: 1200, facing: "left" });
  assert.deepEqual(hotspot.effects, []);
  assert.deepEqual(sceneObject, {
    id: "table",
    name: "Mesa",
    elementId: "table",
    hotspotId: "table_surface",
    locationId: "table_surface",
    actions: [{
      id: "look",
      label: "Mirar",
      enabledWhen: null,
      effects: [{ type: "start_dialogue", dialogueId: "table_look" }],
    }],
  });
});

test("table approach is deferred and arrival exposes only the selected table", () => {
  const { sceneModel, gameState } = loadExample();
  const table = findById(sceneModel.objects, "table");
  const hotspot = findById(sceneModel.hotspots, table.hotspotId);
  const player = findById(sceneModel.actors, sceneModel.controlledActorId);
  const runtime = createSceneObjectInteractionRuntime();
  const fixture = viewFixture();
  const route = calculateHotspotApproachRoute(
    sceneModel.walk,
    player.position,
    hotspot,
    gameState,
  );

  setPendingSceneObject(runtime, table.id);
  renderNearbyObjects(
    fixture.panel,
    fixture.objectContainer,
    availableSceneObjects(sceneModel, gameState, runtime),
    runtime.selectedObjectId,
    () => {},
    {
      actionsContainer: fixture.actionContainer,
      gameState,
      onAction() {},
    },
  );
  assert.deepEqual(route.at(-1), { x: 1000, y: 1200 });
  assert.equal(fixture.panel.hidden, true);
  assert.equal(runtime.activeLocationId, null);
  assert.equal(runtime.selectedObjectId, null);

  completePendingSceneObject(runtime, sceneModel, gameState);
  const nearby = availableSceneObjects(sceneModel, gameState, runtime);
  renderNearbyObjects(
    fixture.panel,
    fixture.objectContainer,
    nearby,
    runtime.selectedObjectId,
    () => {},
    {
      actionsContainer: fixture.actionContainer,
      gameState,
      onAction() {},
    },
  );
  assert.deepEqual(nearby.map((object) => object.id), ["table"]);
  assert.deepEqual(fixture.objectButtons.map((button) => button.textContent), ["Mesa"]);
  assert.deepEqual(fixture.actionButtons.map((button) => button.textContent), ["Mirar"]);
  assert.deepEqual(runtime, {
    pendingObjectId: null,
    activeLocationId: "table_surface",
    selectedObjectId: "table",
  });
});

test("table Look is explicit, preserves state and selection, and disables during dialogue", () => {
  const { document, sceneModel, gameState, yaml } = loadExample();
  const runtime = createSceneObjectInteractionRuntime();
  const dialogueRuntime = createDialogueRuntime();
  const table = findById(sceneModel.objects, "table");
  const documentBefore = structuredClone(document);
  const modelBefore = structuredClone(sceneModel);
  const flagsBefore = { ...gameState.flags };
  const inventoryBefore = [...gameState.inventory];
  setPendingSceneObject(runtime, table.id);
  completePendingSceneObject(runtime, sceneModel, gameState);

  assert.equal(dialogueIsActive(dialogueRuntime), false);
  const action = resolveSelectedSceneObjectAction(
    sceneModel,
    gameState,
    runtime,
    table.id,
    "look",
  ).action;
  applyGameActions(gameState, action.effects, {
    startDialogue(dialogueId) {
      startDialogue(dialogueRuntime, dialogueId, sceneModel.dialogues);
    },
  });
  assert.equal(dialogueIsActive(dialogueRuntime), true);
  assert.equal(dialogueRuntime.currentDialogue.dialogueId, "table_look");

  const fixture = viewFixture();
  renderNearbyObjects(
    fixture.panel,
    fixture.objectContainer,
    availableSceneObjects(sceneModel, gameState, runtime),
    runtime.selectedObjectId,
    () => {},
    {
      actionsContainer: fixture.actionContainer,
      actionsDisabled: true,
      gameState,
      onAction() {},
    },
  );
  assert.deepEqual(fixture.actionButtons.map((button) => button.textContent), ["Mirar"]);
  assert.deepEqual(fixture.actionButtons.map((button) => button.disabled), [true]);

  advanceDialogue(dialogueRuntime, sceneModel.dialogues);
  assert.equal(dialogueIsActive(dialogueRuntime), false);
  assert.equal(runtime.selectedObjectId, "table");
  assert.deepEqual({ ...gameState.flags }, flagsBefore);
  assert.deepEqual(gameState.inventory, inventoryBefore);
  assert.deepEqual(document, documentBefore);
  assert.deepEqual(sceneModel, modelBefore);
  assert.equal(
    readFileSync(new URL("../index.html", import.meta.url), "utf8").includes(yaml),
    true,
  );
});

test("table location is independent and later overlapping drawer hotspots keep priority", () => {
  const { sceneModel, gameState } = loadExample();
  const table = findById(sceneModel.objects, "table");
  const key = findById(sceneModel.objects, "brass_key");
  const drawer = findById(sceneModel.objects, "table_drawer");
  const tableHotspotIndex = sceneModel.hotspots.findIndex(({ id }) => id === "table_surface");
  const drawerHotspotIndex = sceneModel.hotspots.findIndex(({ id }) => id === "table_drawer");
  const coinHotspotIndex = sceneModel.hotspots.findIndex(({ id }) => id === "drawer_coin");

  assert.equal(table.locationId, "table_surface");
  assert.equal(key.locationId, "table");
  assert.notEqual(table.locationId, key.locationId);
  assert.ok(tableHotspotIndex < drawerHotspotIndex);
  assert.ok(tableHotspotIndex < coinHotspotIndex);
  assert.equal(hotspotActivationTarget(sceneModel, "table_drawer").sceneObject.id, drawer.id);
  assert.deepEqual(
    drawer.actions
      .filter((action) => sceneObjectActionIsAvailable(action, gameState))
      .map((action) => action.id),
    ["open"],
  );
});
