import { matchesFlagCondition } from "./flag-condition.js";

export function resolveSceneElementVariant(element, gameState) {
  const activeVariants = element.variants.filter((variant) => (
    matchesFlagCondition(variant.when, gameState)
  ));

  if (activeVariants.length > 1) {
    throw new Error(`El elemento ${element.id} tiene más de una variante activa.`);
  }
  if (activeVariants.length === 0) {
    return element;
  }

  const resolvedElement = {
    ...element,
    ...activeVariants[0].properties,
  };
  if (Object.hasOwn(activeVariants[0].properties, "asset")) {
    resolvedElement.color = null;
  } else if (Object.hasOwn(activeVariants[0].properties, "color")) {
    resolvedElement.asset = null;
  }
  return resolvedElement;
}
