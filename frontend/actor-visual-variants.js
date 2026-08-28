import { createActorVisualStates } from "./character-visual.js";
import { createFlagCondition, matchesFlagCondition } from "./flag-condition.js";

export function createActorVisualVariants(
  value,
  directions,
  gameState,
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
    rejectUnknownProperties(definition, new Set(["when", "states"]), variantPath);
    if (!Object.hasOwn(definition, "states")) {
      throw new Error(`${variantPath} debe declarar states.`);
    }
    return {
      when: createFlagCondition(definition.when, gameState, `${variantPath}.when`),
      visual: createActorVisualStates(
        definition.states,
        directions,
        `${variantPath}.states`,
      ),
    };
  });
}

export function resolveActorEffectiveVisual(actor, gameState) {
  const activeVariants = actor.visualVariants.filter((variant) => (
    matchesFlagCondition(variant.when, gameState)
  ));
  if (activeVariants.length > 1) {
    throw new Error(`El actor ${actor.id} tiene más de una variante visual activa.`);
  }
  return activeVariants.length === 0
    ? actor.visual
    : activeVariants[0].visual;
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
