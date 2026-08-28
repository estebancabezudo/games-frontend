export function createFlagCondition(value, gameState, path) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} debe ser un objeto.`);
  }

  const flag = requiredText(value.flag, `${path}.flag`);
  if (!Object.hasOwn(gameState.flags, flag)) {
    throw new Error(`${path}.flag refiere a un flag no declarado: ${flag}.`);
  }
  if (typeof value.value !== "boolean") {
    throw new Error(`${path}.value debe ser true o false.`);
  }

  return { flag, value: value.value };
}

export function matchesFlagCondition(condition, gameState) {
  return gameState.flags[condition.flag] === condition.value;
}

function requiredText(value, path) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${path} debe ser un texto no vacío.`);
  }
  return value.trim();
}
