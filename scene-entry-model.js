import { actorFacingIsSupported } from "./actor-facing.js";

export function createSceneEntries(value, controlledActor, path = "entries") {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error(`${path} debe ser una lista.`);
  }
  if (value.length > 0 && controlledActor === null) {
    throw new Error(`${path} requiere que la escena tenga un actor controlado.`);
  }

  const ids = new Set();
  return value.map((entry, index) => {
    const entryPath = `${path}[${index}]`;
    const definition = requiredObject(entry, entryPath);
    rejectUnknownProperties(definition, new Set(["id", "position", "facing"]), entryPath);
    const position = requiredObject(definition.position, `${entryPath}.position`);
    rejectUnknownProperties(position, new Set(["x", "y"]), `${entryPath}.position`);
    const id = requiredText(definition.id, `${entryPath}.id`);
    if (ids.has(id)) {
      throw new Error(`${path} contiene un id duplicado: ${id}.`);
    }
    ids.add(id);

    return {
      id,
      position: {
        x: requiredCoordinate(position.x, `${entryPath}.position.x`),
        y: requiredCoordinate(position.y, `${entryPath}.position.y`),
      },
      facing: definition.facing === undefined
        ? null
        : requiredFacing(definition.facing, controlledActor, `${entryPath}.facing`),
    };
  });
}

export function sceneEntryById(sceneModel, entryId) {
  return sceneModel.entries.find((entry) => entry.id === entryId) ?? null;
}

function requiredFacing(value, controlledActor, path) {
  const facing = requiredText(value, path);
  const directions = controlledActor.visual.directions;
  if (!actorFacingIsSupported(facing, directions)) {
    throw new Error(
      `${path} no es compatible con el actor controlado de ${directions} direcciones: ${facing}.`,
    );
  }
  return facing;
}

function requiredCoordinate(value, path) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${path} debe ser un número finito mayor o igual que cero.`);
  }
  return value;
}

function requiredText(value, path) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${path} debe ser texto no vacío.`);
  }
  return value.trim();
}

function requiredObject(value, path) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} debe ser un objeto.`);
  }
  return value;
}

function rejectUnknownProperties(value, supported, path) {
  const unknown = Object.keys(value).filter((property) => !supported.has(property));
  if (unknown.length > 0) {
    throw new Error(`${path} contiene propiedades desconocidas: ${unknown.join(", ")}.`);
  }
}
