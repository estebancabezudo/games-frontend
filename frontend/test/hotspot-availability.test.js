import assert from "node:assert/strict";
import test from "node:test";
import { hotspotIsEnabled } from "../hotspot-availability.js";
import { resolvePendingInteraction } from "../interaction-runtime.js";
import { createSceneModel } from "../scene-model.js";
import { updateHotspotButtonAvailability } from "../scene-renderer.js";

function sceneDocument(enabledWhen) {
  return {
    game: { id: "example" },
    scene: { id: "room" },
    viewport: { orientation: "portrait" },
    size: { width: 1000, height: 1000 },
    background: { color: "#dddddd" },
    hotspots: [{
      id: "switch",
      ...(enabledWhen === undefined ? {} : { enabled_when: enabledWhen }),
      area: { x: 100, y: 100, width: 100, height: 100 },
      effects: [{ toggle_flag: "light_on" }],
    }],
  };
}

function buttonNode() {
  return {
    hidden: false,
    disabled: false,
    dataset: {},
    attributes: {},
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
  };
}

test("a hotspot without enabled_when remains enabled", () => {
  const state = { inventory: [], flags: { light_on: false } };
  const model = createSceneModel(sceneDocument(), state);

  assert.equal(model.hotspots[0].enabledWhen, null);
  assert.equal(hotspotIsEnabled(model.hotspots[0], state), true);
});

test("a hotspot condition resolves true and false from runtime state", () => {
  const state = { inventory: [], flags: { light_on: false, switch_enabled: true } };
  const model = createSceneModel(sceneDocument({
    flag: "switch_enabled",
    value: true,
  }), state);

  assert.equal(hotspotIsEnabled(model.hotspots[0], state), true);
  state.flags.switch_enabled = false;
  assert.equal(hotspotIsEnabled(model.hotspots[0], state), false);
});

test("hotspot enabled_when validates its flag and boolean with the exact path", () => {
  assert.throws(
    () => createSceneModel(
      sceneDocument({ flag: "missing", value: true }),
      { inventory: [], flags: { light_on: false } },
    ),
    /hotspots\[0\]\.enabled_when\.flag refiere a un flag no declarado: missing/,
  );
  assert.throws(
    () => createSceneModel(
      sceneDocument({ flag: "switch_enabled", value: "yes" }),
      { inventory: [], flags: { light_on: false, switch_enabled: true } },
    ),
    /hotspots\[0\]\.enabled_when\.value debe ser true o false/,
  );
});

test("a disabled hotspot executes neither generic nor item effects", () => {
  const state = {
    inventory: ["key"],
    flags: { switch_enabled: false, light_on: false },
  };
  const hotspot = {
    id: "switch",
    enabledWhen: { flag: "switch_enabled", value: true },
    effects: [{ type: "toggle_flag", flag: "light_on" }],
  };
  const scene = { hotspots: [hotspot] };

  assert.throws(
    () => resolvePendingInteraction(
      { targetType: "hotspot", targetId: "switch", itemId: null },
      scene,
      null,
      state,
    ),
    /hotspot switch está deshabilitado/,
  );
  assert.throws(
    () => resolvePendingInteraction(
      { targetType: "hotspot", targetId: "switch", itemId: "key" },
      scene,
      {
        itemId: "key",
        targetType: "hotspot",
        targetId: "switch",
        effects: [{ type: "set_flag", flag: "light_on" }],
      },
      state,
    ),
    /hotspot switch está deshabilitado/,
  );
  assert.equal(state.flags.light_on, false);
});

test("hotspot availability is evaluated again when approach finishes", () => {
  const state = {
    inventory: [],
    flags: { switch_enabled: true, light_on: false },
  };
  const model = createSceneModel(sceneDocument({
    flag: "switch_enabled",
    value: true,
  }), state);
  const pending = { targetType: "hotspot", targetId: "switch", itemId: null };
  state.flags.switch_enabled = false;

  assert.throws(
    () => resolvePendingInteraction(pending, model, null, state),
    /hotspot switch está deshabilitado/,
  );
  assert.equal(state.flags.light_on, false);
});

test("renderer hides and disables a hotspot and reflects flag changes", () => {
  const state = { flags: { switch_enabled: false } };
  const hotspot = {
    enabledWhen: { flag: "switch_enabled", value: true },
  };
  const node = buttonNode();

  assert.equal(updateHotspotButtonAvailability(node, hotspot, state), false);
  assert.equal(node.hidden, true);
  assert.equal(node.disabled, true);
  assert.equal(node.dataset.enabled, "false");
  assert.equal(node.attributes["aria-disabled"], "true");

  state.flags.switch_enabled = true;
  assert.equal(updateHotspotButtonAvailability(node, hotspot, state), true);
  assert.equal(node.hidden, false);
  assert.equal(node.disabled, false);
  assert.equal(node.dataset.enabled, "true");
  assert.equal(node.attributes["aria-disabled"], "false");
});

test("availability checks do not modify YAML, model, or condition", () => {
  const document = sceneDocument({ flag: "switch_enabled", value: false });
  const state = {
    inventory: [],
    flags: { switch_enabled: false, light_on: false },
  };
  const model = createSceneModel(document, state);
  const documentBefore = structuredClone(document);
  const hotspotBefore = structuredClone(model.hotspots[0]);

  assert.equal(hotspotIsEnabled(model.hotspots[0], state), true);
  updateHotspotButtonAvailability(buttonNode(), model.hotspots[0], state);

  assert.deepEqual(document, documentBefore);
  assert.deepEqual(model.hotspots[0], hotspotBefore);
});
