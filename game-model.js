import { createSceneModel } from "./scene-model.js";

export function createGameModel(document, gameState, items = []) {
  const gameId = requiredText(document?.game?.id, "game.id");
  const definitions = normalizeSceneDefinitions(document);
  const scenes = createScenes(definitions, gameId, gameState, items);
  const initialSceneId = definitions.legacy
    ? legacyInitialSceneId(document, scenes[0].sceneId)
    : requiredText(document?.game?.initial_scene, "game.initial_scene");

  if (!scenes.some((scene) => scene.sceneId === initialSceneId)) {
    throw new Error(`game.initial_scene debe referir a una escena existente: ${initialSceneId}.`);
  }

  return {
    id: gameId,
    initialSceneId,
    items,
    initialState: {
      inventory: [...gameState.inventory],
      flags: { ...gameState.flags },
    },
    scenes,
  };
}

export function initialSceneModel(gameModel) {
  const scene = gameModel.scenes.find(
    (candidate) => candidate.sceneId === gameModel.initialSceneId,
  );
  if (scene === undefined) {
    throw new Error(`No existe la escena inicial: ${gameModel.initialSceneId}.`);
  }
  return scene;
}

function normalizeSceneDefinitions(document) {
  const hasLegacyScene = document?.scene !== undefined;
  const hasScenes = document?.scenes !== undefined;
  if (hasLegacyScene && hasScenes) {
    throw new Error("El juego no puede declarar scene y scenes al mismo tiempo.");
  }
  if (hasLegacyScene) {
    return { legacy: true, values: [{ ...document, id: document.scene?.id }] };
  }
  if (!Array.isArray(document?.scenes) || document.scenes.length === 0) {
    throw new Error("scenes debe ser una lista no vacía.");
  }
  return { legacy: false, values: document.scenes };
}

function createScenes(definitions, gameId, gameState, items) {
  const sceneIds = new Set();
  definitions.values.forEach((definition, index) => {
    const id = sceneIdForError(definition, index);
    if (sceneIds.has(id)) {
      throw new Error(`scenes contiene un id duplicado: ${id}.`);
    }
    sceneIds.add(id);
  });
  return definitions.values.map((definition, index) => {
    const id = definition.id;
    try {
      return createSceneModel(definition, gameState, items, { gameId, sceneIds });
    } catch (error) {
      throw new Error(`scenes[${index}] (${id}) es inválida: ${error.message}`, { cause: error });
    }
  });
}

function legacyInitialSceneId(document, sceneId) {
  if (document?.game?.initial_scene === undefined) {
    return sceneId;
  }
  return requiredText(document.game.initial_scene, "game.initial_scene");
}

function sceneIdForError(definition, index) {
  try {
    return requiredText(definition?.id, `scenes[${index}].id`);
  } catch (error) {
    throw new Error(`scenes[${index}] es inválida: ${error.message}`, { cause: error });
  }
}

function requiredText(value, path) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${path} debe ser un texto no vacío.`);
  }
  return value.trim();
}
