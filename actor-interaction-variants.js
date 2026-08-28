import { createFlagCondition, matchesFlagCondition } from "./flag-condition.js";
import { createGameActions } from "./game-actions.js";

export function createActorInteractionVariants(
  value,
  gameState,
  dialogues,
  items,
  path,
) {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error(`${path} debe ser una lista.`);
  }

  return value.map((variant, index) => {
    const variantPath = `${path}[${index}]`;
    const definition = requiredObject(variant, variantPath);
    rejectUnknownProperties(definition, new Set(["when", "effects"]), variantPath);
    if (!Object.hasOwn(definition, "when") || !Object.hasOwn(definition, "effects")) {
      throw new Error(`${variantPath} debe declarar exactamente when y effects.`);
    }
    return {
      when: createFlagCondition(definition.when, gameState, `${variantPath}.when`),
      effects: createGameActions(
        definition.effects,
        gameState,
        dialogues,
        `${variantPath}.effects`,
        items,
      ),
    };
  });
}

export function resolveActorInteractionEffects(actor, gameState) {
  const activeVariants = actor.interactions.variants.filter((variant) => (
    matchesFlagCondition(variant.when, gameState)
  ));
  if (activeVariants.length > 1) {
    throw new Error(
      `El actor ${actor.id} tiene más de una variante de interacción activa.`,
    );
  }
  return activeVariants.length === 0
    ? actor.interactions.effects
    : activeVariants[0].effects;
}

function requiredObject(value, path) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} debe ser un objeto.`);
  }
  return value;
}

function rejectUnknownProperties(value, supportedProperties, path) {
  const unknown = Object.keys(value).filter((property) => !supportedProperties.has(property));
  if (unknown.length > 0) {
    throw new Error(`${path} contiene propiedades desconocidas: ${unknown.join(", ")}.`);
  }
}
