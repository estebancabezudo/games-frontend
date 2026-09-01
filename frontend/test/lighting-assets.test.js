import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { createCharacterMovementLoop } from "../character-movement.js";
import { createCharacterRuntime, setCharacterRoute } from "../character-runtime.js";
import { resolveSceneElementVariant } from "../element-variants.js";
import { applyGameActions } from "../game-actions.js";
import { createGameModel, initialSceneModel } from "../game-model.js";
import { createGameState } from "../game-state.js";
import { calculateHotspotApproachRoute } from "../hotspot-interaction.js";
import {
  createInteractionRuntime,
  resolvePendingInteraction,
  setPendingInteraction,
  takePendingInteraction,
} from "../interaction-runtime.js";
import { createItemCatalog } from "../item-model.js";
import { createSvgAssetPath } from "../svg-asset.js";
import { createWalkModel } from "../walk-model.js";
import { parseYaml } from "../yaml-parser.js";

const ASSET_PATHS = [
  "assets/yard-background-dark.svg",
  "assets/yard-background-light.svg",
  "assets/table-dark.svg",
  "assets/table-light.svg",
  "assets/light-switch-off.svg",
  "assets/light-switch-on.svg",
];

function loadExample() {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const yaml = html.match(/<textarea[^>]*id="yaml-editor"[^>]*>([\s\S]*?)<\/textarea>/)?.[1];
  assert.ok(yaml, "index.html must contain the example YAML");
  const document = parseYaml(yaml);
  const items = createItemCatalog(document.items);
  const gameState = createGameState(document, items);
  const gameModel = createGameModel(document, gameState, items);
  return {
    document,
    gameState,
    gameModel,
    sceneModel: initialSceneModel(gameModel),
    yaml,
  };
}

function element(sceneModel, id) {
  return sceneModel.elements.find((candidate) => candidate.id === id);
}

function hotspot(sceneModel, id) {
  return sceneModel.hotspots.find((candidate) => candidate.id === id);
}

function resolvedAsset(sceneModel, gameState, id) {
  return resolveSceneElementVariant(element(sceneModel, id), gameState).asset;
}

function completePendingHotspot(sceneModel, gameState, hotspotId) {
  const interactionRuntime = createInteractionRuntime();
  setPendingInteraction(interactionRuntime, "hotspot", hotspotId);
  const pending = takePendingInteraction(interactionRuntime);
  const interaction = resolvePendingInteraction(
    pending,
    sceneModel,
    null,
    gameState,
  );
  applyGameActions(gameState, interaction.effects);
}

function createArrivalHarness(onRouteComplete) {
  const runtime = createCharacterRuntime({
    id: "player",
    asset: "assets/player.svg",
    position: { x: 0, y: 0 },
    size: { width: 10, height: 20 },
  });
  setCharacterRoute(runtime, [{ x: 100, y: 0 }], { width: 200, height: 200 });
  const callbacks = [];
  const loop = createCharacterMovementLoop(
    runtime,
    () => {},
    onRouteComplete,
    {
      request(callback) {
        callbacks.push(callback);
        return callbacks.length;
      },
      cancel() {},
    },
  );
  loop.start();
  callbacks.shift()(0);
  return () => callbacks.shift()(1000);
}

test("the example replaces dark_overlay with declarative lighting assets", () => {
  const { sceneModel, yaml } = loadExample();

  assert.doesNotMatch(yaml, /\bid:\s*dark_overlay\b/);
  assert.ok(element(sceneModel, "yard_background"));
  assert.ok(element(sceneModel, "table"));
  assert.ok(element(sceneModel, "light_switch"));
});

test("effective light switches the yard and table variants", () => {
  const { sceneModel, gameState } = loadExample();

  assert.equal(gameState.flags.light_on, false);
  assert.equal(resolvedAsset(sceneModel, gameState, "yard_background"), "assets/yard-background-dark.svg");
  assert.equal(resolvedAsset(sceneModel, gameState, "table"), "assets/table-dark.svg");

  completePendingHotspot(sceneModel, gameState, "light_switch");

  assert.equal(gameState.flags.light_switch_on, true);
  assert.equal(gameState.flags.light_on, true);
  assert.equal(resolvedAsset(sceneModel, gameState, "yard_background"), "assets/yard-background-light.svg");
  assert.equal(resolvedAsset(sceneModel, gameState, "table"), "assets/table-light.svg");
});

test("the switch asset follows its physical flag independently of electricity", () => {
  const { sceneModel, gameState } = loadExample();

  gameState.flags.electricity_on = false;
  completePendingHotspot(sceneModel, gameState, "light_switch");

  assert.equal(gameState.flags.light_switch_on, true);
  assert.equal(gameState.flags.light_on, false);
  assert.equal(resolvedAsset(sceneModel, gameState, "light_switch"), "assets/light-switch-on.svg");
  assert.equal(resolvedAsset(sceneModel, gameState, "yard_background"), "assets/yard-background-dark.svg");
  assert.equal(resolvedAsset(sceneModel, gameState, "table"), "assets/table-dark.svg");
});

test("all lighting assets exist and are self-contained SVGs with a viewBox", () => {
  ASSET_PATHS.forEach((assetPath) => {
    assert.equal(createSvgAssetPath(assetPath, "asset"), assetPath);
    const assetUrl = new URL(`../public/${assetPath}`, import.meta.url);
    assert.equal(existsSync(assetUrl), true, `${assetPath} must exist`);
    const svg = readFileSync(assetUrl, "utf8");
    assert.match(svg, /^<svg\b[^>]*\bviewBox="[^"]+"[^>]*>/);
    assert.match(svg, /<\/svg>\s*$/);
    assert.doesNotMatch(svg, /<script\b|\b(?:href|src)="(?:https?:|\/\/)/i);
  });
});

test("light_switch has a physical approach and changes flags only on arrival", () => {
  const { sceneModel, gameState } = loadExample();
  const switchHotspot = hotspot(sceneModel, "light_switch");
  const beforeDocument = structuredClone(sceneModel);
  const completeArrival = createArrivalHarness(() => {
    completePendingHotspot(sceneModel, gameState, switchHotspot.id);
  });

  assert.deepEqual(switchHotspot.approach, { x: 300, y: 1400, facing: "up" });
  assert.equal(gameState.flags.light_switch_on, false);
  assert.equal(gameState.flags.light_on, false);

  completeArrival();

  assert.equal(gameState.flags.light_switch_on, true);
  assert.equal(gameState.flags.light_on, true);
  assert.deepEqual(sceneModel, beforeDocument);
});

test("an impossible switch approach changes neither mutable nor computed light flags", () => {
  const walk = createWalkModel({
    nodes: [
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 100, y: 0 },
      { id: "c", x: 500, y: 0 },
      { id: "d", x: 600, y: 0 },
    ],
    paths: [
      { from: "a", to: "b" },
      { from: "c", to: "d" },
    ],
  });
  const { gameState } = loadExample();

  assert.throws(() => calculateHotspotApproachRoute(
    walk,
    { x: 50, y: 0 },
    { id: "light_switch", approach: { x: 550, y: 0 } },
    gameState,
  ), /No existe una ruta/);
  assert.equal(gameState.flags.light_switch_on, false);
  assert.equal(gameState.flags.light_on, false);
});

test("the lever remains deferred until its existing approach completes", () => {
  const { sceneModel, gameState } = loadExample();
  const lever = hotspot(sceneModel, "lever_switch");
  const completeArrival = createArrivalHarness(() => {
    completePendingHotspot(sceneModel, gameState, lever.id);
  });

  assert.deepEqual(lever.approach, { x: 2350, y: 1120, facing: "up" });
  assert.equal(gameState.flags.lever_on, false);
  completeArrival();
  assert.equal(gameState.flags.lever_on, true);
});

test("lighting resolution does not mutate YAML or declarative variants", () => {
  const { document, sceneModel, gameState, yaml } = loadExample();
  const documentBefore = structuredClone(document);
  const elementsBefore = structuredClone(sceneModel.elements);

  completePendingHotspot(sceneModel, gameState, "light_switch");
  resolvedAsset(sceneModel, gameState, "yard_background");
  resolvedAsset(sceneModel, gameState, "table");
  resolvedAsset(sceneModel, gameState, "light_switch");

  assert.deepEqual(document, documentBefore);
  assert.deepEqual(sceneModel.elements, elementsBefore);
  assert.equal(
    readFileSync(new URL("../index.html", import.meta.url), "utf8").includes(yaml),
    true,
  );
});
