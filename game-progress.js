import { constrainCharacterPosition } from "./character-bounds.js";
import { copyFlagsState, flagDefinition } from "./flag-state.js";
import { requireCatalogItem } from "./item-model.js";
import {
  copyScenePositionSnapshots,
  createScenePositionState,
  setScenePositionSnapshot,
} from "./scene-position-state.js";

export const GAME_PROGRESS_VERSION = 1;

const ROOT_PROPERTIES = new Set([
  "version",
  "gameId",
  "activeSceneId",
  "flags",
  "inventory",
  "scenePositions",
]);
const POSITION_TOLERANCE = 1e-6;

export function createGameProgressSnapshot({
  gameModel,
  gameState,
  activeSceneId,
  scenePositionState,
  activeActorsRuntime,
}) {
  const activeScene = requireScene(gameModel, activeSceneId, "activeSceneId");
  const storedPositions = copyScenePositionSnapshots(scenePositionState);
  storedPositions.set(
    activeSceneId,
    runtimePositions(activeScene, activeActorsRuntime, "activeActorsRuntime"),
  );

  const flags = {};
  mutableFlagNames(gameModel).forEach((name) => {
    const value = gameState?.flags?.[name];
    if (typeof value !== "boolean") {
      throw new Error(`gameState.flags.${name} debe ser booleano.`);
    }
    flags[name] = value;
  });

  return {
    version: GAME_PROGRESS_VERSION,
    gameId: gameModel.id,
    activeSceneId,
    flags,
    inventory: validatedInventory(gameState?.inventory, gameModel.items, "gameState.inventory"),
    scenePositions: serializedScenePositions(gameModel, storedPositions),
  };
}

export function restoreGameProgressSnapshot(snapshot, gameModel) {
  const value = requiredPlainObject(snapshot, "snapshot");
  rejectUnknownProperties(value, ROOT_PROPERTIES, "snapshot");
  requireOwnProperties(value, ROOT_PROPERTIES, "snapshot");
  if (value.version !== GAME_PROGRESS_VERSION) {
    throw new Error(`snapshot.version debe ser exactamente ${GAME_PROGRESS_VERSION}.`);
  }
  if (value.gameId !== gameModel.id) {
    throw new Error(`snapshot.gameId no corresponde al juego cargado: ${String(value.gameId)}.`);
  }
  const activeScene = requireScene(gameModel, value.activeSceneId, "snapshot.activeSceneId");
  const flags = restoredFlags(value.flags, gameModel);
  const inventory = validatedInventory(value.inventory, gameModel.items, "snapshot.inventory");
  const scenePositionState = restoredScenePositions(
    value.scenePositions,
    gameModel,
    activeScene.sceneId,
  );

  return {
    gameState: { flags, inventory },
    activeSceneId: activeScene.sceneId,
    scenePositionState,
  };
}

function restoredFlags(value, gameModel) {
  const source = requiredPlainObject(value, "snapshot.flags");
  const expectedNames = mutableFlagNames(gameModel);
  rejectUnknownProperties(source, new Set(expectedNames), "snapshot.flags");
  expectedNames.forEach((name) => {
    if (!Object.hasOwn(source, name)) {
      throw new Error(`snapshot.flags.${name} es obligatorio.`);
    }
    if (typeof source[name] !== "boolean") {
      throw new Error(`snapshot.flags.${name} debe ser booleano.`);
    }
  });
  const flags = copyFlagsState(gameModel.initialState.flags);
  expectedNames.forEach((name) => {
    flags[name] = source[name];
  });
  return flags;
}

function restoredScenePositions(value, gameModel, activeSceneId) {
  const source = requiredPlainObject(value, "snapshot.scenePositions");
  const sceneIds = new Set(gameModel.scenes.map((scene) => scene.sceneId));
  rejectUnknownProperties(source, sceneIds, "snapshot.scenePositions");
  if (!Object.hasOwn(source, activeSceneId)) {
    throw new Error(`snapshot.scenePositions.${activeSceneId} es obligatorio para la escena activa.`);
  }
  const state = createScenePositionState();
  gameModel.scenes.forEach((scene) => {
    if (!Object.hasOwn(source, scene.sceneId)) return;
    const positions = normalizedScenePositions(
      source[scene.sceneId],
      scene,
      `snapshot.scenePositions.${scene.sceneId}`,
    );
    setScenePositionSnapshot(state, scene.sceneId, positions);
  });
  return state;
}

function serializedScenePositions(gameModel, storedPositions) {
  const result = {};
  gameModel.scenes.forEach((scene) => {
    const positions = storedPositions.get(scene.sceneId);
    if (positions === undefined) return;
    result[scene.sceneId] = normalizedScenePositions(
      Object.fromEntries(positions),
      scene,
      `scenePositions.${scene.sceneId}`,
    );
  });
  return result;
}

function runtimePositions(scene, actorsRuntime, path) {
  const runtime = requiredPlainObject(actorsRuntime, path);
  const actorIds = new Set(scene.actors.map((actor) => actor.id));
  rejectUnknownProperties(runtime, actorIds, path);
  const positions = new Map();
  scene.actors.forEach((actor) => {
    if (!Object.hasOwn(runtime, actor.id)) {
      throw new Error(`${path}.${actor.id} es obligatorio.`);
    }
    positions.set(actor.id, normalizedPosition(
      runtime[actor.id]?.position,
      actor,
      scene,
      `${path}.${actor.id}.position`,
    ));
  });
  return positions;
}

function normalizedScenePositions(value, scene, path) {
  const source = requiredPlainObject(value, path);
  const actorIds = new Set(scene.actors.map((actor) => actor.id));
  rejectUnknownProperties(source, actorIds, path);
  const positions = {};
  scene.actors.forEach((actor) => {
    if (!Object.hasOwn(source, actor.id)) {
      throw new Error(`${path}.${actor.id} es obligatorio.`);
    }
    positions[actor.id] = normalizedPosition(
      source[actor.id], actor, scene, `${path}.${actor.id}`,
    );
  });
  return positions;
}

function normalizedPosition(value, actor, scene, path) {
  const position = requiredPlainObject(value, path);
  rejectUnknownProperties(position, new Set(["x", "y"]), path);
  for (const coordinate of ["x", "y"]) {
    if (!Object.hasOwn(position, coordinate)) {
      throw new Error(`${path}.${coordinate} es obligatorio.`);
    }
    if (
      typeof position[coordinate] !== "number"
      || !Number.isFinite(position[coordinate])
      || position[coordinate] < 0
    ) {
      throw new Error(`${path}.${coordinate} debe ser un número finito mayor o igual que cero.`);
    }
  }
  const normalized = { x: position.x, y: position.y };
  const constrained = constrainCharacterPosition(actor, scene.depthScale, scene.size, normalized);
  if (
    Math.abs(constrained.x - normalized.x) > POSITION_TOLERANCE
    || Math.abs(constrained.y - normalized.y) > POSITION_TOLERANCE
  ) {
    throw new Error(`${path} está fuera de los límites renderizados del actor.`);
  }
  return normalized;
}

function validatedInventory(value, items, path) {
  if (!Array.isArray(value)) {
    throw new Error(`${path} debe ser una lista.`);
  }
  const inventory = value.map((itemId, index) => {
    const itemPath = `${path}[${index}]`;
    if (typeof itemId !== "string" || itemId.trim() === "") {
      throw new Error(`${itemPath} debe ser texto no vacío.`);
    }
    const normalized = itemId.trim();
    requireCatalogItem(items, normalized, itemPath);
    return normalized;
  });
  const duplicate = inventory.find((itemId, index) => inventory.indexOf(itemId) !== index);
  if (duplicate !== undefined) {
    throw new Error(`${path} contiene un id duplicado: ${duplicate}.`);
  }
  return inventory;
}

function mutableFlagNames(gameModel) {
  const state = { flags: gameModel.initialState.flags };
  return Object.keys(gameModel.initialState.flags).filter(
    (name) => flagDefinition(state, name)?.type !== "computed",
  );
}

function requireScene(gameModel, sceneId, path) {
  if (typeof sceneId !== "string" || sceneId.trim() === "") {
    throw new Error(`${path} debe ser texto no vacío.`);
  }
  const scene = gameModel.scenes.find((candidate) => candidate.sceneId === sceneId);
  if (scene === undefined) {
    throw new Error(`${path} refiere a una escena inexistente: ${sceneId}.`);
  }
  return scene;
}

function requiredPlainObject(value, path) {
  if (
    value === null
    || typeof value !== "object"
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(`${path} debe ser un objeto simple.`);
  }
  return value;
}

function rejectUnknownProperties(value, supported, path) {
  const unknown = Object.keys(value).filter((property) => !supported.has(property));
  if (unknown.length > 0) {
    throw new Error(`${path} contiene propiedades desconocidas: ${unknown.join(", ")}.`);
  }
}

function requireOwnProperties(value, required, path) {
  required.forEach((property) => {
    if (!Object.hasOwn(value, property)) {
      throw new Error(`${path}.${property} es obligatorio.`);
    }
  });
}
