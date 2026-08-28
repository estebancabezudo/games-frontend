import {
  applyFlagEffects,
  createFlagEffect,
} from "./flag-effects.js";
import { giveInventoryItem, takeInventoryItem } from "./inventory-runtime.js";
import { requireCatalogItem } from "./item-model.js";

const FLAG_ACTION_TYPES = new Set(["set_flag", "clear_flag", "toggle_flag"]);

export function createGameActions(
  value,
  gameState,
  dialogues = [],
  path = "effects",
  items = [],
  options = {},
) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${path} debe contener una o más acciones.`);
  }
  const dialogueIds = new Set(dialogues.map((dialogue) => dialogue.id));
  const actions = value.map((action, index) => {
    const actionPath = `${path}[${index}]`;
    const definition = requiredObject(action, actionPath);
    const entries = Object.entries(definition);
    if (entries.length !== 1) {
      throw new Error(`${actionPath} debe declarar exactamente una acción.`);
    }
    const [type, rawValue] = entries[0];
    if (FLAG_ACTION_TYPES.has(type)) {
      return createFlagEffect(definition, gameState, actionPath);
    }
    if (type === "give_item" || type === "take_item") {
      const itemId = requiredText(rawValue, `${actionPath}.${type}`);
      requireCatalogItem(items, itemId, `${actionPath}.${type}`);
      return { type, itemId };
    }
    if (type === "start_dialogue") {
      const dialogueId = requiredText(rawValue, `${actionPath}.start_dialogue`);
      if (!dialogueIds.has(dialogueId)) {
        throw new Error(
          `${actionPath}.start_dialogue refiere a un diálogo inexistente: ${dialogueId}.`,
        );
      }
      return { type, dialogueId };
    }
    if (type === "change_scene") {
      if (options.allowChangeScene !== true) {
        throw new Error(`${actionPath}.change_scene no está permitido en este contexto.`);
      }
      const sceneId = requiredText(rawValue, `${actionPath}.change_scene`);
      if (!(options.sceneIds instanceof Set) || !options.sceneIds.has(sceneId)) {
        throw new Error(
          `${actionPath}.change_scene refiere a una escena inexistente: ${sceneId}.`,
        );
      }
      return { type, sceneId };
    }
    throw new Error(
      `${actionPath} debe usar set_flag, clear_flag, toggle_flag, give_item, take_item, start_dialogue o change_scene.`,
    );
  });
  validateSceneChanges(actions, path);
  return actions;
}

export function applyGameActions(gameState, actions, handlers = {}) {
  actions.forEach((action) => {
    if (FLAG_ACTION_TYPES.has(action.type)) {
      applyFlagEffects(gameState, [action]);
      return;
    }
    if (action.type === "give_item") {
      giveInventoryItem(gameState, action.itemId);
      return;
    }
    if (action.type === "take_item") {
      takeInventoryItem(gameState, action.itemId);
      return;
    }
    if (action.type === "start_dialogue") {
      if (typeof handlers.startDialogue !== "function") {
        throw new Error("No existe un runtime disponible para iniciar diálogos.");
      }
      handlers.startDialogue(action.dialogueId);
      return;
    }
    if (action.type === "change_scene") {
      if (typeof handlers.changeScene !== "function") {
        throw new Error("No existe un runtime disponible para cambiar de escena.");
      }
      handlers.changeScene(action.sceneId);
      return;
    }
    throw new Error(`Tipo de acción no soportado: ${action.type}.`);
  });
}

function validateSceneChanges(actions, path) {
  const sceneChanges = actions.filter((action) => action.type === "change_scene");
  if (sceneChanges.length > 1) {
    throw new Error(`${path} no puede contener más de un change_scene.`);
  }
  if (sceneChanges.length === 1 && actions.at(-1).type !== "change_scene") {
    throw new Error(`${path}: change_scene debe ser la última acción.`);
  }
}

function requiredObject(value, path) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} debe ser un objeto de acción.`);
  }
  return value;
}

function requiredText(value, path) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${path} debe ser texto no vacío.`);
  }
  return value.trim();
}
