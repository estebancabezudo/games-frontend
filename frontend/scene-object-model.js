import { createGameActions } from "./game-actions.js";
import { createFlagCondition } from "./flag-condition.js";

export function createSceneObjects(
  value,
  elements,
  hotspots,
  gameState,
  dialogues = [],
  items = [],
  path = "objects",
) {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error(`${path} debe ser una lista.`);
  }

  const objectIds = new Set();
  const assignedElements = new Set();
  const assignedHotspots = new Set();
  const elementIds = new Set(elements.map((element) => element.id));
  const hotspotIds = new Set(hotspots.map((hotspot) => hotspot.id));

  return value.map((entry, index) => {
    const entryPath = `${path}[${index}]`;
    const definition = requiredObject(entry, entryPath);
    rejectUnknownProperties(
      definition,
      new Set(["id", "name", "element", "hotspot", "location", "actions"]),
      entryPath,
    );
    const sceneObject = {
      id: requiredText(definition.id, `${entryPath}.id`),
      name: requiredText(definition.name, `${entryPath}.name`),
      elementId: requiredText(definition.element, `${entryPath}.element`),
      hotspotId: requiredText(definition.hotspot, `${entryPath}.hotspot`),
      locationId: definition.location === undefined
        ? null
        : requiredText(definition.location, `${entryPath}.location`),
      actions: createSceneObjectActions(
        definition.actions,
        gameState,
        dialogues,
        items,
        `${entryPath}.actions`,
      ),
    };
    sceneObject.locationId ??= sceneObject.id;
    requireUnique(objectIds, sceneObject.id, `${path} contiene un id duplicado`);
    requireReference(elementIds, sceneObject.elementId, `${entryPath}.element`, "elemento");
    requireReference(hotspotIds, sceneObject.hotspotId, `${entryPath}.hotspot`, "hotspot");
    requireUnique(
      assignedElements,
      sceneObject.elementId,
      `${entryPath}.element ya está asignado a otro objeto`,
    );
    requireUnique(
      assignedHotspots,
      sceneObject.hotspotId,
      `${entryPath}.hotspot ya está asignado a otro objeto`,
    );
    return sceneObject;
  });
}

function createSceneObjectActions(value, gameState, dialogues, items, path) {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error(`${path} debe ser una lista.`);
  }
  const actionIds = new Set();
  return value.map((entry, index) => {
    const actionPath = `${path}[${index}]`;
    const definition = requiredObject(entry, actionPath);
    rejectUnknownProperties(
      definition,
      new Set(["id", "label", "enabled_when", "effects"]),
      actionPath,
    );
    const action = {
      id: requiredText(definition.id, `${actionPath}.id`),
      label: requiredText(definition.label, `${actionPath}.label`),
      enabledWhen: definition.enabled_when === undefined
        ? null
        : createFlagCondition(
          definition.enabled_when,
          gameState,
          `${actionPath}.enabled_when`,
        ),
      effects: createGameActions(
        definition.effects,
        gameState,
        dialogues,
        `${actionPath}.effects`,
        items,
      ),
    };
    requireUnique(actionIds, action.id, `${path} contiene un id duplicado`);
    return action;
  });
}

function requiredObject(value, path) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} debe ser un objeto.`);
  }
  return value;
}

function requiredText(value, path) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${path} debe ser un texto no vacío.`);
  }
  return value.trim();
}

function rejectUnknownProperties(value, supportedProperties, path) {
  const unknown = Object.keys(value).filter((property) => !supportedProperties.has(property));
  if (unknown.length > 0) {
    throw new Error(`${path} contiene propiedades desconocidas: ${unknown.join(", ")}.`);
  }
}

function requireUnique(values, value, prefix) {
  if (values.has(value)) {
    throw new Error(`${prefix}: ${value}.`);
  }
  values.add(value);
}

function requireReference(values, value, path, referenceType) {
  if (!values.has(value)) {
    throw new Error(`${path} refiere a un ${referenceType} inexistente: ${value}.`);
  }
}
