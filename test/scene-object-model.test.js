import assert from "node:assert/strict";
import test from "node:test";
import { createSceneObjects } from "../scene-object-model.js";
import { createSceneObjectHoverController } from "../scene-object-hover.js";

const elements = [{ id: "brass_key" }, { id: "drawer" }];
const hotspots = [{ id: "key_hotspot" }, { id: "drawer_hotspot" }];

function objectDefinition(overrides = {}) {
  return {
    id: "brass_key",
    name: "Llave",
    element: "brass_key",
    hotspot: "key_hotspot",
    ...overrides,
  };
}

function eventNode() {
  const listeners = new Map();
  return {
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(listener);
    },
    dispatch(type) {
      (listeners.get(type) ?? []).forEach((listener) => listener({ type }));
    },
  };
}

function outputNode() {
  return { textContent: "", hidden: true };
}

test("a legacy scene without objects normalizes to an empty list", () => {
  assert.deepEqual(createSceneObjects(undefined, elements, hotspots), []);
});

test("a valid scene object trims and normalizes all values", () => {
  const definition = objectDefinition({
    id: "  brass_key  ",
    name: "  Llave  ",
    element: "  brass_key  ",
    hotspot: "  key_hotspot  ",
  });
  const before = structuredClone(definition);

  assert.deepEqual(createSceneObjects([definition], elements, hotspots), [{
    id: "brass_key",
    name: "Llave",
    elementId: "brass_key",
    hotspotId: "key_hotspot",
    locationId: "brass_key",
    actions: [],
  }]);
  assert.deepEqual(definition, before);
});

test("scene object location defaults to id and explicit location is trimmed", () => {
  assert.equal(
    createSceneObjects([objectDefinition()], elements, hotspots)[0].locationId,
    "brass_key",
  );
  assert.equal(
    createSceneObjects([
      objectDefinition({ location: "  table  " }),
    ], elements, hotspots)[0].locationId,
    "table",
  );
  assert.throws(
    () => createSceneObjects([
      objectDefinition({ location: "  " }),
    ], elements, hotspots),
    /objects\[0\]\.location debe ser un texto no vacío/,
  );
});

test("multiple scene objects can share a location", () => {
  const objects = createSceneObjects([
    objectDefinition({ location: "table" }),
    objectDefinition({
      id: "drawer",
      name: "Cajón",
      element: "drawer",
      hotspot: "drawer_hotspot",
      location: "table",
    }),
  ], elements, hotspots);

  assert.deepEqual(objects.map((sceneObject) => sceneObject.locationId), ["table", "table"]);
});

test("scene objects reject invalid lists, entries, and text fields", () => {
  assert.throws(
    () => createSceneObjects({}, elements, hotspots),
    /objects debe ser una lista/,
  );
  assert.throws(
    () => createSceneObjects([null], elements, hotspots),
    /objects\[0\] debe ser un objeto/,
  );
  for (const field of ["id", "name", "element", "hotspot"]) {
    assert.throws(
      () => createSceneObjects([objectDefinition({ [field]: "  " })], elements, hotspots),
      new RegExp(`objects\\[0\\]\\.${field} debe ser un texto no vacío`),
    );
  }
});

test("scene objects reject unknown properties and duplicate ids", () => {
  assert.throws(
    () => createSceneObjects([objectDefinition({ description: "key" })], elements, hotspots),
    /propiedades desconocidas: description/,
  );
  assert.throws(
    () => createSceneObjects([objectDefinition(), objectDefinition({
      element: "drawer",
      hotspot: "drawer_hotspot",
    })], elements, hotspots),
    /objects contiene un id duplicado: brass_key/,
  );
});

test("scene objects require existing element and hotspot references", () => {
  assert.throws(
    () => createSceneObjects([objectDefinition({ element: "missing" })], elements, hotspots),
    /element refiere a un elemento inexistente: missing/,
  );
  assert.throws(
    () => createSceneObjects([objectDefinition({ hotspot: "missing" })], elements, hotspots),
    /hotspot refiere a un hotspot inexistente: missing/,
  );
});

test("an element or hotspot cannot belong to two scene objects", () => {
  assert.throws(
    () => createSceneObjects([
      objectDefinition(),
      objectDefinition({ id: "other", hotspot: "drawer_hotspot" }),
    ], elements, hotspots),
    /element ya está asignado a otro objeto: brass_key/,
  );
  assert.throws(
    () => createSceneObjects([
      objectDefinition(),
      objectDefinition({ id: "other", element: "drawer" }),
    ], elements, hotspots),
    /hotspot ya está asignado a otro objeto: key_hotspot/,
  );
});

test("pointer enter and leave show and clear the object name", () => {
  const output = outputNode();
  const node = eventNode();
  const hover = createSceneObjectHoverController(output);
  hover.bind(node, { id: "brass_key", name: "Llave" });

  node.dispatch("pointerenter");
  assert.equal(output.textContent, "Objeto: Llave");
  assert.equal(output.hidden, false);
  assert.equal(hover.currentObjectId(), "brass_key");

  node.dispatch("pointerleave");
  assert.equal(output.textContent, "");
  assert.equal(output.hidden, true);
  assert.equal(hover.currentObjectId(), null);
});

test("focus and blur show and clear the object name", () => {
  const output = outputNode();
  const node = eventNode();
  const hover = createSceneObjectHoverController(output);
  hover.bind(node, { id: "brass_key", name: "Llave" });

  node.dispatch("focus");
  assert.equal(output.textContent, "Objeto: Llave");
  node.dispatch("blur");
  assert.equal(output.textContent, "");
  assert.equal(output.hidden, true);
});

test("clearing a renderer removes its previous object name", () => {
  const output = outputNode();
  const node = eventNode();
  const hover = createSceneObjectHoverController(output);
  hover.bind(node, { id: "brass_key", name: "Llave" });
  node.dispatch("pointerenter");

  hover.clear();

  assert.equal(output.textContent, "");
  assert.equal(output.hidden, true);
  assert.equal(hover.currentObjectId(), null);
});

test("hover changes no game state or runtime and preserves hotspot clicks", () => {
  const output = outputNode();
  const node = eventNode();
  const hover = createSceneObjectHoverController(output);
  const sceneObject = { id: "brass_key", name: "Llave" };
  const state = { inventory: [], flags: { brass_key_taken: false } };
  const runtime = {
    pendingObjectId: null,
    activeLocationId: null,
    selectedObjectId: null,
  };
  const stateBefore = structuredClone(state);
  const runtimeBefore = structuredClone(runtime);
  const objectBefore = structuredClone(sceneObject);
  let clicks = 0;
  hover.bind(node, sceneObject);
  node.addEventListener("click", () => { clicks += 1; });

  node.dispatch("pointerenter");
  node.dispatch("pointerleave");
  node.dispatch("focus");
  node.dispatch("blur");
  node.dispatch("click");

  assert.equal(clicks, 1);
  assert.deepEqual(state, stateBefore);
  assert.deepEqual(runtime, runtimeBefore);
  assert.deepEqual(sceneObject, objectBefore);
});

test("hover and focus ignore an unavailable scene object", () => {
  const output = outputNode();
  const node = eventNode();
  const hover = createSceneObjectHoverController(output);
  hover.bind(node, { id: "brass_key", name: "Llave" }, () => false);

  node.dispatch("pointerenter");
  node.dispatch("focus");

  assert.equal(output.hidden, true);
  assert.equal(output.textContent, "");
  assert.equal(hover.currentObjectId(), null);
});
