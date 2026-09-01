import { createItemCatalog, requireCatalogItem } from "./item-model.js";
import { createFlagsState } from "./flag-state.js";

export function createGameState(document, items = createItemCatalog(document?.items)) {
  const state = requiredObject(document?.state, "state");

  return {
    inventory: inventoryItems(state.inventory, items),
    flags: createFlagsState(state.flags),
  };
}

function inventoryItems(value, items) {
  if (!Array.isArray(value)) {
    throw new Error("state.inventory debe ser una lista.");
  }

  const inventory = value.map((item, index) => {
    const path = `state.inventory[${index}]`;
    return requireCatalogItem(items, requiredText(item, path), path);
  });
  const duplicate = inventory.find((item, index) => inventory.indexOf(item) !== index);
  if (duplicate !== undefined) {
    throw new Error(`state.inventory contiene un id duplicado: ${duplicate}.`);
  }
  return inventory;
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
