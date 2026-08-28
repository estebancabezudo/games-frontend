const SUPPORTED_FLAG_EFFECTS = new Set([
  "set_flag",
  "clear_flag",
  "toggle_flag",
]);

export function createFlagEffects(value, gameState, path) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${path} debe contener uno o más efectos.`);
  }

  return value.map((effect, index) => createFlagEffect(
    effect,
    gameState,
    `${path}[${index}]`,
  ));
}

export function applyFlagEffects(gameState, effects) {
  for (const effect of effects) {
    if (!Object.hasOwn(gameState.flags, effect.flag)) {
      throw new Error(`El flag no está declarado en state.flags: ${effect.flag}.`);
    }

    if (effect.type === "set_flag") {
      gameState.flags[effect.flag] = true;
    } else if (effect.type === "clear_flag") {
      gameState.flags[effect.flag] = false;
    } else if (effect.type === "toggle_flag") {
      gameState.flags[effect.flag] = !gameState.flags[effect.flag];
    } else {
      throw new Error(`Tipo de efecto de flag no soportado: ${effect.type}.`);
    }
  }
}

export function createFlagEffect(value, gameState, path) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} debe ser un objeto de efecto.`);
  }

  const entries = Object.entries(value);
  if (entries.length !== 1 || !SUPPORTED_FLAG_EFFECTS.has(entries[0][0])) {
    throw new Error(`${path} debe usar set_flag, clear_flag o toggle_flag.`);
  }

  const [type, rawFlag] = entries[0];
  const flag = requiredText(rawFlag, `${path}.${type}`);
  if (!Object.hasOwn(gameState.flags, flag)) {
    throw new Error(`${path}.${type} refiere a un flag no declarado: ${flag}.`);
  }

  return { type, flag };
}

function requiredText(value, path) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${path} debe ser el nombre de un flag.`);
  }
  return value.trim();
}
