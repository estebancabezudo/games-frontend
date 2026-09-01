import assert from "node:assert/strict";
import test from "node:test";
import { applyGameActions } from "../game-actions.js";
import { createFlagsState } from "../flag-state.js";
import { sceneObjectActionIsAvailable } from "../scene-object-action-availability.js";
import { createSceneObjects } from "../scene-object-model.js";
import {
  reconcileSceneObjectContext,
  availableSceneObjects,
} from "../scene-object-runtime.js";
import { resolveSelectedSceneObjectAction } from "../scene-object-actions.js";
import { renderNearbyObjects } from "../scene-object-view.js";

const elements = [{
  id: "brass_key_element",
  visibleWhen: { flag: "brass_key_taken", value: false },
}];
const hotspots = [{ id: "key_hotspot", enabledWhen: null, effects: [] }];
const dialogues = [{ id: "brass_key_look" }];
const items = [{ id: "brass_key" }];

function gameState() {
  return {
    inventory: [],
    flags: {
      brass_key_taken: false,
      hotspot_effect_ran: false,
    },
  };
}

function definition(overrides = {}) {
  return {
    id: "brass_key",
    name: "Llave",
    element: "brass_key_element",
    hotspot: "key_hotspot",
    location: "table",
    actions: [
      {
        id: "look",
        label: "Mirar",
        effects: [{ start_dialogue: "brass_key_look" }],
      },
      {
        id: "take",
        label: "Tomar",
        effects: [
          { give_item: "brass_key" },
          { set_flag: "brass_key_taken" },
        ],
      },
    ],
    ...overrides,
  };
}

function createObjects(value = [definition()], state = gameState()) {
  return createSceneObjects(value, elements, hotspots, state, dialogues, items);
}

function sceneModel(objects = createObjects()) {
  return { objects, elements, hotspots };
}

function runtime() {
  return {
    pendingObjectId: null,
    activeLocationId: "table",
    selectedObjectId: "brass_key",
  };
}

function viewFixture() {
  const objectButtons = [];
  const actionButtons = [];
  const ownerDocument = {
    createElement() {
      const listeners = {};
      return {
        dataset: {},
        attributes: {},
        disabled: false,
        addEventListener(type, listener) { listeners[type] = listener; },
        setAttribute(name, value) { this.attributes[name] = value; },
        click(event = {}) { listeners.click?.(event); },
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
    panel: { hidden: true },
    objectButtons,
    actionButtons,
    objectsContainer: container(objectButtons),
    actionsContainer: container(actionButtons),
  };
}

test("normalizes declarative object actions and keeps objects without actions compatible", () => {
  const source = definition({
    actions: [{
      id: "  look  ",
      label: "  Mirar  ",
      effects: [{ start_dialogue: "brass_key_look" }],
    }],
  });
  const sourceBefore = structuredClone(source);
  const normalized = createObjects([source])[0];

  assert.deepEqual(normalized.actions, [{
    id: "look",
    label: "Mirar",
    enabledWhen: null,
    effects: [{ type: "start_dialogue", dialogueId: "brass_key_look" }],
  }]);
  assert.deepEqual(source, sourceBefore);

  const withoutActions = definition();
  delete withoutActions.actions;
  assert.deepEqual(createObjects([withoutActions])[0].actions, []);
});

test("rejects malformed actions, unknown properties, and duplicate ids", () => {
  assert.throws(
    () => createObjects([definition({ actions: {} })]),
    /objects\[0\]\.actions debe ser una lista/,
  );
  assert.throws(
    () => createObjects([definition({ actions: [null] })]),
    /objects\[0\]\.actions\[0\] debe ser un objeto/,
  );
  assert.throws(
    () => createObjects([definition({ actions: [{
      id: "look",
      label: "Mirar",
      effects: [{ start_dialogue: "brass_key_look" }],
      when: true,
    }] })]),
    /propiedades desconocidas: when/,
  );
  assert.throws(
    () => createObjects([definition({ actions: [
      { id: "look", label: "Mirar", effects: [{ start_dialogue: "brass_key_look" }] },
      { id: "look", label: "Otra", effects: [{ start_dialogue: "brass_key_look" }] },
    ] })]),
    /actions contiene un id duplicado: look/,
  );
});

test("rejects invalid action id, label, and effects", () => {
  for (const field of ["id", "label"]) {
    assert.throws(
      () => createObjects([definition({ actions: [{
        id: "look",
        label: "Mirar",
        effects: [{ start_dialogue: "brass_key_look" }],
        [field]: "  ",
      }] })]),
      new RegExp(`actions\\[0\\]\\.${field} debe ser un texto no vacío`),
    );
  }
  assert.throws(
    () => createObjects([definition({ actions: [{ id: "look", label: "Mirar", effects: [] }] })]),
    /effects debe contener una o más acciones/,
  );
});

test("normalizes optional action conditions without retaining YAML references", () => {
  const source = definition({ actions: [{
    id: "take",
    label: "Tomar",
    enabled_when: { flag: "brass_key_taken", value: false },
    effects: [{ give_item: "brass_key" }],
  }] });
  const sourceBefore = structuredClone(source);
  const action = createObjects([source])[0].actions[0];

  assert.deepEqual(action.enabledWhen, {
    flag: "brass_key_taken",
    value: false,
  });
  assert.notEqual(action.enabledWhen, source.actions[0].enabled_when);
  assert.deepEqual(source, sourceBefore);
});

test("validates action condition flags, boolean values, structures, and properties", () => {
  const actionWith = (enabledWhen) => definition({ actions: [{
    id: "take",
    label: "Tomar",
    enabled_when: enabledWhen,
    effects: [{ give_item: "brass_key" }],
  }] });

  assert.throws(
    () => createObjects([actionWith({ flag: "missing", value: true })]),
    /flag refiere a un flag no declarado: missing/,
  );
  assert.throws(
    () => createObjects([actionWith({ flag: "brass_key_taken", value: "yes" })]),
    /value debe ser true o false/,
  );
  for (const invalid of [null, [], "brass_key_taken"]) {
    assert.throws(
      () => createObjects([actionWith(invalid)]),
      /enabled_when debe ser un objeto/,
    );
  }
  assert.throws(
    () => createObjects([actionWith({
      flag: "brass_key_taken",
      value: true,
      priority: 1,
    })]),
    /enabled_when contiene propiedades desconocidas: priority/,
  );
});

test("evaluates true, false, value false, and computed flag conditions", () => {
  const state = gameState();
  const conditional = (flag, value) => createObjects([definition({ actions: [{
    id: "take",
    label: "Tomar",
    enabled_when: { flag, value },
    effects: [{ give_item: "brass_key" }],
  }] })], state)[0].actions[0];

  assert.equal(sceneObjectActionIsAvailable(conditional("brass_key_taken", false), state), true);
  assert.equal(sceneObjectActionIsAvailable(conditional("brass_key_taken", true), state), false);
  state.flags.brass_key_taken = true;
  assert.equal(sceneObjectActionIsAvailable(conditional("brass_key_taken", true), state), true);

  const computedState = {
    inventory: [],
    flags: createFlagsState({
      electricity_on: true,
      switch_on: false,
      light_on: "electricity_on and switch_on",
    }),
  };
  const computedAction = createObjects([definition({ actions: [{
    id: "look",
    label: "Mirar",
    enabled_when: { flag: "light_on", value: true },
    effects: [{ start_dialogue: "brass_key_look" }],
  }] })], computedState)[0].actions[0];
  assert.equal(sceneObjectActionIsAvailable(computedAction, computedState), false);
  computedState.flags.switch_on = true;
  assert.equal(sceneObjectActionIsAvailable(computedAction, computedState), true);
});

test("reuses flag, item, and dialogue validation and rejects change_scene", () => {
  assert.throws(
    () => createObjects([definition({ actions: [{
      id: "bad", label: "Bad", effects: [{ set_flag: "missing" }],
    }] })]),
    /flag no declarado: missing/,
  );
  assert.throws(
    () => createObjects([definition({ actions: [{
      id: "bad", label: "Bad", effects: [{ give_item: "missing" }],
    }] })]),
    /item inexistente: missing/,
  );
  assert.throws(
    () => createObjects([definition({ actions: [{
      id: "bad", label: "Bad", effects: [{ start_dialogue: "missing" }],
    }] })]),
    /diálogo inexistente: missing/,
  );
  assert.throws(
    () => createObjects([definition({ actions: [{
      id: "bad", label: "Bad", effects: [{ change_scene: "house" }],
    }] })]),
    /change_scene no está permitido en este contexto/,
  );
});

test("renders actions only for the selected object and updates with selection", () => {
  const fixture = viewFixture();
  const key = createObjects()[0];
  const drawer = {
    ...key,
    id: "drawer",
    name: "Cajón",
    actions: [{ id: "open", label: "Abrir", effects: [] }],
  };
  const available = [key, drawer];

  renderNearbyObjects(
    fixture.panel,
    fixture.objectsContainer,
    available,
    "brass_key",
    () => {},
    { actionsContainer: fixture.actionsContainer, onAction() {} },
  );
  assert.deepEqual(fixture.actionButtons.map((button) => button.textContent), ["Mirar", "Tomar"]);

  renderNearbyObjects(
    fixture.panel,
    fixture.objectsContainer,
    available,
    "drawer",
    () => {},
    { actionsContainer: fixture.actionsContainer, onAction() {} },
  );
  assert.deepEqual(fixture.actionButtons.map((button) => button.textContent), ["Abrir"]);
});

test("hides conditional actions and reflects flag changes on the next render", () => {
  const fixture = viewFixture();
  const state = gameState();
  const key = createObjects([definition({ actions: [{
    id: "take",
    label: "Tomar",
    enabled_when: { flag: "brass_key_taken", value: true },
    effects: [{ give_item: "brass_key" }],
  }] })], state)[0];
  const render = () => renderNearbyObjects(
    fixture.panel,
    fixture.objectsContainer,
    [key],
    "brass_key",
    () => {},
    {
      actionsContainer: fixture.actionsContainer,
      gameState: state,
      onAction() {},
    },
  );

  render();
  assert.equal(fixture.actionButtons.length, 0);
  assert.equal(fixture.actionsContainer.hidden, true);

  state.flags.brass_key_taken = true;
  render();
  assert.deepEqual(fixture.actionButtons.map((button) => button.textContent), ["Tomar"]);
  assert.equal(fixture.actionButtons[0].disabled, false);

  state.flags.brass_key_taken = false;
  render();
  assert.equal(fixture.actionButtons.length, 0);
});

test("action buttons stop scene propagation and are blocked during dialogue", () => {
  const fixture = viewFixture();
  let actions = 0;
  let propagationStops = 0;
  renderNearbyObjects(
    fixture.panel,
    fixture.objectsContainer,
    createObjects(),
    "brass_key",
    () => {},
    {
      actionsContainer: fixture.actionsContainer,
      onAction() { actions += 1; },
      actionsDisabled: true,
    },
  );

  fixture.actionButtons[0].click({ stopPropagation() { propagationStops += 1; } });

  assert.equal(fixture.actionButtons[0].disabled, true);
  assert.equal(propagationStops, 1);
  assert.equal(actions, 0);
});

test("resolves the selected available action again and ignores hotspot effects", () => {
  const state = gameState();
  const model = sceneModel();
  model.hotspots[0].effects = [{ type: "set_flag", flag: "hotspot_effect_ran" }];
  const currentRuntime = runtime();
  const modelBefore = structuredClone(model);
  const { action } = resolveSelectedSceneObjectAction(
    model,
    state,
    currentRuntime,
    "brass_key",
    "take",
  );

  applyGameActions(state, action.effects);

  assert.deepEqual(state.inventory, ["brass_key"]);
  assert.equal(state.flags.brass_key_taken, true);
  assert.equal(state.flags.hotspot_effect_ran, false);
  assert.deepEqual(model, modelBefore);
});

test("executes object effects sequentially through the common action executor", () => {
  const state = gameState();
  const objects = createObjects([definition({ actions: [{
    id: "inspect_and_take",
    label: "Revisar y tomar",
    effects: [
      { give_item: "brass_key" },
      { set_flag: "brass_key_taken" },
      { start_dialogue: "brass_key_look" },
    ],
  }] })], state);
  const model = sceneModel(objects);
  const currentRuntime = runtime();
  const action = resolveSelectedSceneObjectAction(
    model, state, currentRuntime, "brass_key", "inspect_and_take",
  ).action;
  let stateSeenByDialogue = null;

  applyGameActions(state, action.effects, {
    startDialogue() {
      stateSeenByDialogue = {
        inventory: [...state.inventory],
        taken: state.flags.brass_key_taken,
      };
    },
  });

  assert.deepEqual(stateSeenByDialogue, {
    inventory: ["brass_key"],
    taken: true,
  });
});

test("looking preserves context while taking removes the unavailable last object", () => {
  const state = gameState();
  const model = sceneModel();
  const currentRuntime = runtime();
  let activeDialogue = null;
  const look = resolveSelectedSceneObjectAction(
    model, state, currentRuntime, "brass_key", "look",
  ).action;

  applyGameActions(state, look.effects, {
    startDialogue(dialogueId) { activeDialogue = dialogueId; },
  });
  reconcileSceneObjectContext(
    currentRuntime,
    availableSceneObjects(model, state, currentRuntime),
  );
  assert.equal(activeDialogue, "brass_key_look");
  assert.deepEqual(currentRuntime, runtime());

  const take = resolveSelectedSceneObjectAction(
    model, state, currentRuntime, "brass_key", "take",
  ).action;
  applyGameActions(state, take.effects);
  reconcileSceneObjectContext(
    currentRuntime,
    availableSceneObjects(model, state, currentRuntime),
  );
  assert.deepEqual(currentRuntime, {
    pendingObjectId: null,
    activeLocationId: null,
    selectedObjectId: null,
  });
});

test("rejects stale selection, unavailable objects, and actions no longer owned", () => {
  const state = gameState();
  const model = sceneModel();
  const currentRuntime = runtime();
  assert.throws(
    () => resolveSelectedSceneObjectAction(model, state, currentRuntime, "other", "look"),
    /no es el objeto seleccionado/,
  );
  state.flags.brass_key_taken = true;
  assert.throws(
    () => resolveSelectedSceneObjectAction(model, state, currentRuntime, "brass_key", "look"),
    /ya no está disponible/,
  );
  state.flags.brass_key_taken = false;
  assert.throws(
    () => resolveSelectedSceneObjectAction(model, state, currentRuntime, "brass_key", "missing"),
    /ya no pertenece al objeto brass_key/,
  );
});

test("revalidates a stale visible action immediately before execution", () => {
  const state = gameState();
  const objects = createObjects([definition({ actions: [{
    id: "look",
    label: "Mirar",
    enabled_when: { flag: "hotspot_effect_ran", value: false },
    effects: [{ set_flag: "hotspot_effect_ran" }],
  }] })], state);
  const model = sceneModel(objects);
  const currentRuntime = runtime();
  const modelBefore = structuredClone(model);

  assert.equal(sceneObjectActionIsAvailable(objects[0].actions[0], state), true);
  state.flags.hotspot_effect_ran = true;
  assert.throws(
    () => resolveSelectedSceneObjectAction(
      model,
      state,
      currentRuntime,
      "brass_key",
      "look",
    ),
    /acción Mirar ya no está disponible/,
  );
  assert.equal(state.flags.hotspot_effect_ran, true);
  assert.deepEqual(model, modelBefore);
});
