import { restoreGameProgressSnapshot } from "./game-progress.js";

export const GAME_PROGRESS_STORAGE_PREFIX = "cabezudo.games.progress.v1";

export function gameProgressStorageKey(gameId) {
  if (typeof gameId !== "string" || gameId.trim() === "") {
    throw new Error("gameId debe ser texto no vacío.");
  }
  return `${GAME_PROGRESS_STORAGE_PREFIX}:${encodeURIComponent(gameId.trim())}`;
}

export function saveGameProgressSnapshot(storage, snapshot, gameModel) {
  const setItem = requireStorageMethod(storage, "setItem");
  restoreGameProgressSnapshot(snapshot, gameModel);
  let serialized;
  try {
    serialized = JSON.stringify(snapshot);
  } catch (cause) {
    throw new Error(`No se pudo serializar el progreso de ${snapshot.gameId}.`, { cause });
  }
  if (typeof serialized !== "string") {
    const cause = new TypeError("JSON.stringify no produjo texto JSON utilizable.");
    throw new Error(`No se pudo serializar el progreso de ${snapshot.gameId}.`, { cause });
  }

  let serializedSnapshot;
  try {
    serializedSnapshot = JSON.parse(serialized);
  } catch (cause) {
    throw new Error(`No se pudo serializar el progreso de ${snapshot.gameId}.`, { cause });
  }
  try {
    restoreGameProgressSnapshot(serializedSnapshot, gameModel);
  } catch (cause) {
    throw new Error(`El snapshot serializado de ${snapshot.gameId} es inválido.`, { cause });
  }

  const key = gameProgressStorageKey(serializedSnapshot.gameId);
  try {
    setItem.call(storage, key, serialized);
  } catch (cause) {
    throw new Error(`No se pudo guardar el progreso de ${snapshot.gameId}.`, { cause });
  }
}

export function loadGameProgressSnapshot(storage, gameModel) {
  const getItem = requireStorageMethod(storage, "getItem");
  const key = gameProgressStorageKey(gameModel.id);
  let serialized;
  try {
    serialized = getItem.call(storage, key);
  } catch (cause) {
    throw new Error(`No se pudo leer el progreso de ${gameModel.id}.`, { cause });
  }
  if (serialized === null) return null;
  if (typeof serialized !== "string") {
    throw new Error(`El almacenamiento devolvió un progreso no textual para ${gameModel.id}.`);
  }

  let snapshot;
  try {
    snapshot = JSON.parse(serialized);
  } catch (cause) {
    throw new Error(`El progreso guardado de ${gameModel.id} contiene JSON corrupto.`, { cause });
  }
  try {
    return restoreGameProgressSnapshot(snapshot, gameModel);
  } catch (cause) {
    throw new Error(`El progreso guardado de ${gameModel.id} es incompatible o inválido.`, { cause });
  }
}

export function removeGameProgressSnapshot(storage, gameId) {
  const removeItem = requireStorageMethod(storage, "removeItem");
  const key = gameProgressStorageKey(gameId);
  try {
    removeItem.call(storage, key);
  } catch (cause) {
    throw new Error(`No se pudo eliminar el progreso de ${gameId.trim()}.`, { cause });
  }
}

function requireStorageMethod(storage, method) {
  if (storage === null || (typeof storage !== "object" && typeof storage !== "function")) {
    throw new Error("storage debe ser compatible con Storage.");
  }
  if (typeof storage[method] !== "function") {
    throw new Error(`storage.${method} debe ser una función.`);
  }
  return storage[method];
}
