import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import {
  advanceDialogue,
  createDialogueRuntime,
  dialogueIsActive,
  startDialogue,
} from "../dialogue-runtime.js";
import { resolveSceneElementVariant } from "../element-variants.js";
import { flagDefinition } from "../flag-state.js";
import { applyGameActions } from "../game-actions.js";
import { createGameModel, initialSceneModel } from "../game-model.js";
import { createGameState } from "../game-state.js";
import { calculateHotspotApproachRoute } from "../hotspot-interaction.js";
import { hotspotIsEnabled } from "../hotspot-availability.js";
import { createItemCatalog } from "../item-model.js";
import { sceneObjectActionIsAvailable } from "../scene-object-action-availability.js";
import { resolveSelectedSceneObjectAction } from "../scene-object-actions.js";
import { sceneObjectIsAvailable } from "../scene-object-availability.js";
import {
  availableSceneObjects,
  clearSceneObjectInteraction,
  completePendingSceneObject,
  reconcileSceneObjectContext,
  selectSceneObject,
  setPendingSceneObject,
} from "../scene-object-runtime.js";
import { renderNearbyObjects } from "../scene-object-view.js";
import { createSvgAssetPath } from "../svg-asset.js";
import { parseYaml } from "../yaml-parser.js";

const DRAWER_ASSETS = [
  "assets/drawer-closed.svg",
  "assets/drawer-open.svg",
  "assets/coin.svg",
];

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
    items,
    sceneModel: initialSceneModel(gameModel),
    yaml,
  };
}

function findById(values, id) {
  return values.find((value) => value.id === id);
}

function objectRuntime(selectedObjectId = "table_drawer") {
  return {
    pendingObjectId: null,
    activeLocationId: "table_drawer",
    selectedObjectId,
  };
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

test("the example declares the drawer flags and calculated content visibility", () => {
  const { gameState } = loadExample();

  assert.equal(gameState.flags.drawer_open, false);
  assert.equal(gameState.flags.coin_in_drawer, true);
  assert.equal(gameState.flags.drawer_contents_visible, false);
  assert.deepEqual(flagDefinition(gameState, "drawer_contents_visible"), {
    type: "computed",
    left: "drawer_open",
    operator: "and",
    right: "coin_in_drawer",
  });
});

test("drawer and coin share an accessible location but only the drawer is initially available", () => {
  const { sceneModel, gameState } = loadExample();
  const drawer = findById(sceneModel.objects, "table_drawer");
  const coin = findById(sceneModel.objects, "drawer_coin");
  const drawerHotspot = findById(sceneModel.hotspots, "table_drawer");
  const player = findById(sceneModel.actors, sceneModel.controlledActorId);
  const runtime = objectRuntime();
  const route = calculateHotspotApproachRoute(
    sceneModel.walk,
    player.position,
    drawerHotspot,
    gameState,
  );

  assert.equal(drawer.locationId, "table_drawer");
  assert.equal(coin.locationId, "table_drawer");
  assert.deepEqual(drawerHotspot.approach, { x: 1000, y: 1200, facing: "left" });
  assert.deepEqual(route.at(-1), { x: 1000, y: 1200 });
  assert.equal(sceneObjectIsAvailable(drawer, sceneModel, gameState), true);
  assert.equal(sceneObjectIsAvailable(coin, sceneModel, gameState), false);
  assert.deepEqual(
    availableSceneObjects(sceneModel, gameState, runtime).map((object) => object.id),
    ["table_drawer"],
  );
  assert.equal(sceneObjectActionIsAvailable(drawer.actions[0], gameState), true);
});

test("opening executes only drawer_open and leaves declarations untouched", () => {
  const { document, sceneModel, gameState, yaml } = loadExample();
  const runtime = objectRuntime();
  const drawer = findById(sceneModel.objects, "table_drawer");
  const drawerHotspot = findById(sceneModel.hotspots, "table_drawer");
  const documentBefore = structuredClone(document);
  const modelBefore = structuredClone(sceneModel);
  const flagsBefore = { ...gameState.flags };
  const inventoryBefore = [...gameState.inventory];
  const { action } = resolveSelectedSceneObjectAction(
    sceneModel,
    gameState,
    runtime,
    drawer.id,
    "open",
  );

  assert.deepEqual(drawerHotspot.effects, []);
  assert.deepEqual(action.effects, [{ type: "set_flag", flag: "drawer_open" }]);
  applyGameActions(gameState, action.effects);

  assert.equal(gameState.flags.drawer_open, true);
  assert.equal(gameState.flags.drawer_contents_visible, true);
  Object.keys(flagsBefore)
    .filter((flag) => flag !== "drawer_open" && flag !== "drawer_contents_visible")
    .forEach((flag) => assert.equal(gameState.flags[flag], flagsBefore[flag], flag));
  assert.deepEqual(gameState.inventory, inventoryBefore);
  assert.deepEqual(document, documentBefore);
  assert.deepEqual(sceneModel, modelBefore);
  assert.equal(
    readFileSync(new URL("../index.html", import.meta.url), "utf8").includes(yaml),
    true,
  );
});

test("opening switches the asset, removes Open, and reveals the coin in the same context", () => {
  const { sceneModel, gameState } = loadExample();
  const runtime = objectRuntime();
  const drawerObject = findById(sceneModel.objects, "table_drawer");
  const coinObject = findById(sceneModel.objects, "drawer_coin");
  const drawerElement = findById(sceneModel.elements, "table_drawer");
  const coinHotspot = findById(sceneModel.hotspots, "drawer_coin");
  const openAction = drawerObject.actions[0];

  assert.equal(resolveSceneElementVariant(drawerElement, gameState).asset, "assets/drawer-closed.svg");
  applyGameActions(gameState, openAction.effects);

  assert.equal(resolveSceneElementVariant(drawerElement, gameState).asset, "assets/drawer-open.svg");
  assert.equal(sceneObjectActionIsAvailable(openAction, gameState), false);
  assert.equal(sceneObjectActionIsAvailable(drawerObject.actions[1], gameState), true);
  assert.equal(hotspotIsEnabled(coinHotspot, gameState), true);
  assert.equal(sceneObjectIsAvailable(coinObject, sceneModel, gameState), true);

  const available = availableSceneObjects(sceneModel, gameState, runtime);
  reconcileSceneObjectContext(runtime, available);
  assert.deepEqual(available.map((object) => object.id), ["table_drawer", "drawer_coin"]);
  assert.deepEqual(runtime, objectRuntime());

  const fixture = viewFixture();
  const render = () => renderNearbyObjects(
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
  render();
  render();
  assert.deepEqual(fixture.objectButtons.map((button) => button.textContent), ["Cajón", "Moneda"]);
  assert.deepEqual(fixture.actionButtons.map((button) => button.textContent), ["Cerrar"]);
});

test("closing and reopening preserves the drawer context and restores the same coin", () => {
  const { document, sceneModel, gameState, yaml } = loadExample();
  const runtime = objectRuntime();
  const drawer = findById(sceneModel.objects, "table_drawer");
  const coin = findById(sceneModel.objects, "drawer_coin");
  const drawerElement = findById(sceneModel.elements, "table_drawer");
  const documentBefore = structuredClone(document);
  const modelBefore = structuredClone(sceneModel);
  const open = drawer.actions.find((action) => action.id === "open");
  const close = drawer.actions.find((action) => action.id === "close");
  const nearbyIds = () => availableSceneObjects(sceneModel, gameState, runtime)
    .map((object) => object.id);
  const actionIds = () => drawer.actions
    .filter((action) => sceneObjectActionIsAvailable(action, gameState))
    .map((action) => action.id);

  assert.deepEqual(close, {
    id: "close",
    label: "Cerrar",
    enabledWhen: { flag: "drawer_open", value: true },
    effects: [{ type: "clear_flag", flag: "drawer_open" }],
  });
  assert.deepEqual(actionIds(), ["open"]);
  assert.deepEqual(nearbyIds(), ["table_drawer"]);

  applyGameActions(gameState, open.effects);
  reconcileSceneObjectContext(runtime, availableSceneObjects(sceneModel, gameState, runtime));
  assert.equal(gameState.flags.drawer_open, true);
  assert.equal(gameState.flags.drawer_contents_visible, true);
  assert.equal(resolveSceneElementVariant(drawerElement, gameState).asset, "assets/drawer-open.svg");
  assert.deepEqual(actionIds(), ["close"]);
  assert.deepEqual(nearbyIds(), ["table_drawer", "drawer_coin"]);
  assert.deepEqual(runtime, objectRuntime());

  const flagsBeforeClose = { ...gameState.flags };
  applyGameActions(gameState, close.effects);
  reconcileSceneObjectContext(runtime, availableSceneObjects(sceneModel, gameState, runtime));
  assert.equal(gameState.flags.drawer_open, false);
  assert.equal(gameState.flags.coin_in_drawer, true);
  assert.equal(gameState.flags.drawer_contents_visible, false);
  Object.keys(flagsBeforeClose)
    .filter((flag) => flag !== "drawer_open" && flag !== "drawer_contents_visible")
    .forEach((flag) => assert.equal(gameState.flags[flag], flagsBeforeClose[flag], flag));
  assert.equal(resolveSceneElementVariant(drawerElement, gameState).asset, "assets/drawer-closed.svg");
  assert.equal(sceneObjectIsAvailable(coin, sceneModel, gameState), false);
  assert.deepEqual(actionIds(), ["open"]);
  assert.deepEqual(nearbyIds(), ["table_drawer"]);
  assert.deepEqual(runtime, objectRuntime());

  applyGameActions(gameState, open.effects);
  reconcileSceneObjectContext(runtime, availableSceneObjects(sceneModel, gameState, runtime));
  assert.deepEqual(actionIds(), ["close"]);
  assert.deepEqual(nearbyIds(), ["table_drawer", "drawer_coin"]);
  assert.equal(nearbyIds().filter((id) => id === "drawer_coin").length, 1);
  assert.deepEqual(runtime, objectRuntime());
  assert.deepEqual(document, documentBefore);
  assert.deepEqual(sceneModel, modelBefore);
  assert.equal(
    readFileSync(new URL("../index.html", import.meta.url), "utf8").includes(yaml),
    true,
  );
});

test("drawer SVG assets exist, are self-contained, and declare viewBox", () => {
  DRAWER_ASSETS.forEach((assetPath) => {
    assert.equal(createSvgAssetPath(assetPath, "asset"), assetPath);
    const assetUrl = new URL(`../public/${assetPath}`, import.meta.url);
    assert.equal(existsSync(assetUrl), true, `${assetPath} must exist`);
    const svg = readFileSync(assetUrl, "utf8");
    assert.match(svg, /^<svg\b[^>]*\bviewBox="[^"]+"[^>]*>/);
    assert.match(svg, /<\/svg>\s*$/);
    assert.doesNotMatch(svg, /<script\b|\b(?:href|src)="(?:https?:|\/\/)/i);
  });
});

test("the example catalogs coin and normalizes its look and take actions", () => {
  const { items, gameState, sceneModel } = loadExample();
  const coin = findById(sceneModel.objects, "drawer_coin");
  const dialogue = findById(sceneModel.dialogues, "drawer_coin_look");

  assert.ok(findById(items, "coin"));
  assert.equal(gameState.inventory.includes("coin"), false);
  assert.deepEqual(dialogue.lines, [{ actorId: "player", text: "Es una moneda." }]);
  assert.deepEqual(coin.actions, [
    {
      id: "look",
      label: "Mirar",
      enabledWhen: null,
      effects: [{ type: "start_dialogue", dialogueId: "drawer_coin_look" }],
    },
    {
      id: "take",
      label: "Tomar",
      enabledWhen: null,
      effects: [
        { type: "give_item", itemId: "coin" },
        { type: "clear_flag", flag: "coin_in_drawer" },
      ],
    },
  ]);
});

test("coin actions are inaccessible before opening and visible after opening", () => {
  const { gameState, sceneModel } = loadExample();
  const coin = findById(sceneModel.objects, "drawer_coin");
  const runtime = objectRuntime("drawer_coin");

  assert.equal(sceneObjectIsAvailable(coin, sceneModel, gameState), false);
  assert.throws(
    () => resolveSelectedSceneObjectAction(
      sceneModel,
      gameState,
      runtime,
      coin.id,
      "look",
    ),
    /ya no está disponible/,
  );

  gameState.flags.drawer_open = true;
  assert.equal(sceneObjectIsAvailable(coin, sceneModel, gameState), true);
  const fixture = viewFixture();
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
  assert.deepEqual(fixture.actionButtons.map((button) => button.textContent), ["Mirar", "Tomar"]);
});

test("looking at the coin starts dialogue without changing state and preserves selection", () => {
  const { gameState, sceneModel } = loadExample();
  const runtime = objectRuntime("drawer_coin");
  const dialogueRuntime = createDialogueRuntime();
  gameState.flags.drawer_open = true;
  const flagsBefore = { ...gameState.flags };
  const inventoryBefore = [...gameState.inventory];
  const look = resolveSelectedSceneObjectAction(
    sceneModel,
    gameState,
    runtime,
    "drawer_coin",
    "look",
  ).action;

  applyGameActions(gameState, look.effects, {
    startDialogue(dialogueId) {
      startDialogue(dialogueRuntime, dialogueId, sceneModel.dialogues);
    },
  });
  assert.equal(dialogueIsActive(dialogueRuntime), true);
  assert.deepEqual(gameState.inventory, inventoryBefore);
  assert.deepEqual({ ...gameState.flags }, flagsBefore);

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
  assert.deepEqual(fixture.actionButtons.map((button) => button.disabled), [true, true]);

  assert.equal(advanceDialogue(dialogueRuntime, sceneModel.dialogues), null);
  reconcileSceneObjectContext(
    runtime,
    availableSceneObjects(sceneModel, gameState, runtime),
  );
  assert.equal(dialogueIsActive(dialogueRuntime), false);
  assert.deepEqual(runtime, objectRuntime("drawer_coin"));
});

test("taking the coin reconciles the location and rejects stale actions without extra effects", () => {
  const { document, gameState, sceneModel, yaml } = loadExample();
  const runtime = objectRuntime("drawer_coin");
  const coin = findById(sceneModel.objects, "drawer_coin");
  const coinHotspot = findById(sceneModel.hotspots, "drawer_coin");
  const documentBefore = structuredClone(document);
  const modelBefore = structuredClone(sceneModel);
  gameState.flags.drawer_open = true;
  const take = resolveSelectedSceneObjectAction(
    sceneModel,
    gameState,
    runtime,
    coin.id,
    "take",
  ).action;

  assert.deepEqual(coinHotspot.effects, []);
  applyGameActions(gameState, take.effects);
  assert.deepEqual(gameState.inventory, ["dog_food", "coin"]);
  assert.equal(gameState.flags.coin_in_drawer, false);
  assert.equal(gameState.flags.drawer_contents_visible, false);
  assert.equal(sceneObjectIsAvailable(coin, sceneModel, gameState), false);

  const inventoryAfterTake = [...gameState.inventory];
  const flagsAfterTake = { ...gameState.flags };
  assert.throws(
    () => resolveSelectedSceneObjectAction(
      sceneModel,
      gameState,
      runtime,
      coin.id,
      "look",
    ),
    /ya no está disponible/,
  );
  assert.deepEqual(gameState.inventory, inventoryAfterTake);
  assert.deepEqual({ ...gameState.flags }, flagsAfterTake);

  const available = availableSceneObjects(sceneModel, gameState, runtime);
  reconcileSceneObjectContext(runtime, available);
  assert.deepEqual(available.map((object) => object.id), ["table_drawer"]);
  assert.deepEqual(runtime, {
    pendingObjectId: null,
    activeLocationId: "table_drawer",
    selectedObjectId: null,
  });
  assert.deepEqual(document, documentBefore);
  assert.deepEqual(sceneModel, modelBefore);
  assert.equal(
    readFileSync(new URL("../index.html", import.meta.url), "utf8").includes(yaml),
    true,
  );
});

test("the example normalizes the empty drawer dialogue and conditional look action", () => {
  const { sceneModel } = loadExample();
  const drawer = findById(sceneModel.objects, "table_drawer");
  const dialogue = findById(sceneModel.dialogues, "drawer_empty_look");

  assert.deepEqual(dialogue.lines, [{
    actorId: "player",
    text: "El cajón está vacío.",
  }]);
  assert.deepEqual(drawer.actions[2], {
    id: "look_empty",
    label: "Mirar",
    enabledWhen: { flag: "coin_in_drawer", value: false },
    effects: [{ type: "start_dialogue", dialogueId: "drawer_empty_look" }],
  });
});

test("drawer actions transition from Open to Close and then Close plus empty Look", () => {
  const { sceneModel, gameState } = loadExample();
  const drawer = findById(sceneModel.objects, "table_drawer");
  const runtime = objectRuntime();
  const availableActionIds = () => drawer.actions
    .filter((action) => sceneObjectActionIsAvailable(action, gameState))
    .map((action) => action.id);

  assert.deepEqual(availableActionIds(), ["open"]);
  const flagsBefore = { ...gameState.flags };
  const inventoryBefore = [...gameState.inventory];
  assert.throws(
    () => resolveSelectedSceneObjectAction(
      sceneModel,
      gameState,
      runtime,
      drawer.id,
      "look_empty",
    ),
    /acción Mirar ya no está disponible/,
  );
  assert.deepEqual({ ...gameState.flags }, flagsBefore);
  assert.deepEqual(gameState.inventory, inventoryBefore);

  gameState.flags.drawer_open = true;
  assert.deepEqual(availableActionIds(), ["close"]);
  gameState.flags.coin_in_drawer = false;
  assert.deepEqual(availableActionIds(), ["close", "look_empty"]);
});

test("empty drawer Look is explicit, disabled during dialogue, and survives leaving and returning", () => {
  const { document, sceneModel, gameState, yaml } = loadExample();
  const drawer = findById(sceneModel.objects, "table_drawer");
  const drawerElement = findById(sceneModel.elements, "table_drawer");
  const runtime = objectRuntime("drawer_coin");
  const dialogueRuntime = createDialogueRuntime();
  const documentBefore = structuredClone(document);
  const modelBefore = structuredClone(sceneModel);
  gameState.flags.drawer_open = true;
  gameState.flags.coin_in_drawer = false;
  gameState.inventory.push("coin");
  reconcileSceneObjectContext(
    runtime,
    availableSceneObjects(sceneModel, gameState, runtime),
  );
  assert.deepEqual(runtime, {
    pendingObjectId: null,
    activeLocationId: "table_drawer",
    selectedObjectId: null,
  });

  const nearby = availableSceneObjects(sceneModel, gameState, runtime);
  assert.deepEqual(nearby.map((object) => object.id), ["table_drawer"]);
  selectSceneObject(runtime, drawer.id, nearby);
  const flagsBeforeLook = { ...gameState.flags };
  const inventoryBeforeLook = [...gameState.inventory];
  const fixture = viewFixture();
  const render = (actionsDisabled = false) => renderNearbyObjects(
    fixture.panel,
    fixture.objectContainer,
    availableSceneObjects(sceneModel, gameState, runtime),
    runtime.selectedObjectId,
    () => {},
    {
      actionsContainer: fixture.actionContainer,
      actionsDisabled,
      gameState,
      onAction() {},
    },
  );
  render();
  render();
  assert.deepEqual(fixture.actionButtons.map((button) => button.textContent), ["Cerrar", "Mirar"]);

  const look = resolveSelectedSceneObjectAction(
    sceneModel,
    gameState,
    runtime,
    drawer.id,
    "look_empty",
  ).action;
  applyGameActions(gameState, look.effects, {
    startDialogue(dialogueId) {
      startDialogue(dialogueRuntime, dialogueId, sceneModel.dialogues);
    },
  });
  assert.equal(dialogueIsActive(dialogueRuntime), true);
  render(true);
  assert.deepEqual(fixture.actionButtons.map((button) => button.disabled), [true, true]);
  assert.deepEqual({ ...gameState.flags }, flagsBeforeLook);
  assert.deepEqual(gameState.inventory, inventoryBeforeLook);

  advanceDialogue(dialogueRuntime, sceneModel.dialogues);
  assert.equal(dialogueIsActive(dialogueRuntime), false);
  assert.equal(runtime.selectedObjectId, "table_drawer");

  clearSceneObjectInteraction(runtime);
  assert.deepEqual(runtime, {
    pendingObjectId: null,
    activeLocationId: null,
    selectedObjectId: null,
  });
  setPendingSceneObject(runtime, drawer.id);
  completePendingSceneObject(runtime, sceneModel, gameState);
  assert.equal(dialogueIsActive(dialogueRuntime), false);
  assert.deepEqual(runtime, objectRuntime());
  assert.equal(resolveSceneElementVariant(drawerElement, gameState).asset, "assets/drawer-open.svg");
  assert.equal(gameState.inventory.includes("coin"), true);
  assert.equal(sceneObjectIsAvailable(findById(sceneModel.objects, "drawer_coin"), sceneModel, gameState), false);
  assert.deepEqual(
    drawer.actions
      .filter((action) => sceneObjectActionIsAvailable(action, gameState))
      .map((action) => action.id),
    ["close", "look_empty"],
  );
  assert.deepEqual(document, documentBefore);
  assert.deepEqual(sceneModel, modelBefore);
  assert.equal(
    readFileSync(new URL("../index.html", import.meta.url), "utf8").includes(yaml),
    true,
  );
});

test("a taken coin never returns across repeated close and reopen cycles", () => {
  const { document, sceneModel, gameState, yaml } = loadExample();
  const runtime = objectRuntime("drawer_coin");
  const drawer = findById(sceneModel.objects, "table_drawer");
  const coin = findById(sceneModel.objects, "drawer_coin");
  const documentBefore = structuredClone(document);
  const modelBefore = structuredClone(sceneModel);
  const open = drawer.actions.find((action) => action.id === "open");
  const close = drawer.actions.find((action) => action.id === "close");

  applyGameActions(gameState, open.effects);
  const take = resolveSelectedSceneObjectAction(
    sceneModel,
    gameState,
    runtime,
    coin.id,
    "take",
  ).action;
  applyGameActions(gameState, take.effects);
  reconcileSceneObjectContext(runtime, availableSceneObjects(sceneModel, gameState, runtime));
  assert.deepEqual(gameState.inventory, ["dog_food", "coin"]);
  assert.equal(gameState.flags.coin_in_drawer, false);
  assert.deepEqual(runtime, {
    pendingObjectId: null,
    activeLocationId: "table_drawer",
    selectedObjectId: null,
  });

  selectSceneObject(
    runtime,
    drawer.id,
    availableSceneObjects(sceneModel, gameState, runtime),
  );
  for (let cycle = 0; cycle < 3; cycle += 1) {
    applyGameActions(gameState, close.effects);
    reconcileSceneObjectContext(runtime, availableSceneObjects(sceneModel, gameState, runtime));
    assert.equal(gameState.flags.drawer_open, false);
    assert.deepEqual(
      drawer.actions
        .filter((action) => sceneObjectActionIsAvailable(action, gameState))
        .map((action) => action.id),
      ["open", "look_empty"],
    );
    assert.deepEqual(
      availableSceneObjects(sceneModel, gameState, runtime).map((object) => object.id),
      ["table_drawer"],
    );
    assert.deepEqual(runtime, objectRuntime());

    applyGameActions(gameState, open.effects);
    reconcileSceneObjectContext(runtime, availableSceneObjects(sceneModel, gameState, runtime));
    assert.equal(gameState.flags.drawer_open, true);
    assert.equal(gameState.flags.coin_in_drawer, false);
    assert.equal(gameState.flags.drawer_contents_visible, false);
    assert.deepEqual(
      drawer.actions
        .filter((action) => sceneObjectActionIsAvailable(action, gameState))
        .map((action) => action.id),
      ["close", "look_empty"],
    );
    assert.deepEqual(
      availableSceneObjects(sceneModel, gameState, runtime).map((object) => object.id),
      ["table_drawer"],
    );
    assert.deepEqual(gameState.inventory, ["dog_food", "coin"]);
    assert.deepEqual(runtime, objectRuntime());
  }

  const fixture = viewFixture();
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
  assert.deepEqual(fixture.objectButtons.map((button) => button.textContent), ["Cajón"]);
  assert.deepEqual(fixture.actionButtons.map((button) => button.textContent), ["Cerrar", "Mirar"]);
  assert.deepEqual(document, documentBefore);
  assert.deepEqual(sceneModel, modelBefore);
  assert.equal(
    readFileSync(new URL("../index.html", import.meta.url), "utf8").includes(yaml),
    true,
  );
});
