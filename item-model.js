export function createItemCatalog(value) {
  if (!Array.isArray(value)) {
    throw new Error("items debe ser una lista.");
  }
  const ids = new Set();
  return value.map((item, index) => {
    const path = `items[${index}]`;
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`${path} debe ser un objeto.`);
    }
    const unsupported = Object.keys(item).filter((property) => property !== "id");
    if (unsupported.length > 0) {
      throw new Error(`${path} contiene propiedades no soportadas: ${unsupported.join(", ")}.`);
    }
    const id = requiredText(item.id, `${path}.id`);
    if (ids.has(id)) {
      throw new Error(`items contiene un id duplicado: ${id}.`);
    }
    ids.add(id);
    return { id };
  });
}

export function requireCatalogItem(items, itemId, path) {
  if (!items.some((item) => item.id === itemId)) {
    throw new Error(`${path} refiere a un item inexistente: ${itemId}.`);
  }
  return itemId;
}

function requiredText(value, path) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${path} debe ser un texto no vacío.`);
  }
  return value.trim();
}
