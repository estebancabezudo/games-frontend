import { createCharacterVisual } from "./character-visual.js";
import {
  createActorVisualVariants,
  resolveActorEffectiveVisual,
} from "./actor-visual-variants.js";
import { createFlagCondition } from "./flag-condition.js";
import { createGameActions } from "./game-actions.js";
import { createActorInteractionVariants } from "./actor-interaction-variants.js";

export function createSceneActor(value, path = "actor", gameState, dialogues = [], items = []) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} debe ser un objeto.`);
  }
  const visual = createCharacterVisual(value, path);
  const actor = {
    id: requiredText(value.id, `${path}.id`),
    visual,
    visualVariants: createActorVisualVariants(
      value.variants,
      visual.directions,
      gameState,
      `${path}.variants`,
    ),
    position: {
      x: requiredCoordinate(value.position?.x, `${path}.position.x`),
      y: requiredCoordinate(value.position?.y, `${path}.position.y`),
    },
    size: {
      width: requiredDimension(value.size?.width, `${path}.size.width`),
      height: requiredDimension(value.size?.height, `${path}.size.height`),
    },
    interactions: createActorInteractions(
      value.interactions,
      gameState,
      dialogues,
      items,
      path,
    ),
    movement: createActorMovement(value.movement, path, gameState),
  };
  resolveActorEffectiveVisual(actor, gameState);
  return actor;
}

function createActorMovement(value, actorPath, gameState) {
  if (value === undefined) {
    return null;
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${actorPath}.movement debe ser un objeto.`);
  }
  if (value.type !== "patrol") {
    throw new Error(`${actorPath}.movement.type debe ser patrol.`);
  }
  if (!Array.isArray(value.points) || value.points.length < 2) {
    throw new Error(`${actorPath}.movement.points debe contener al menos 2 posiciones.`);
  }
  return {
    type: "patrol",
    enabledWhen: value.enabled_when === undefined
      ? null
      : createFlagCondition(
        value.enabled_when,
        gameState,
        `${actorPath}.movement.enabled_when`,
      ),
    points: value.points.map((point, index) => ({
      x: requiredCoordinate(point?.x, `${actorPath}.movement.points[${index}].x`),
      y: requiredCoordinate(point?.y, `${actorPath}.movement.points[${index}].y`),
    })),
  };
}

function createActorInteractions(value, gameState, dialogues, items, actorPath) {
  if (value === undefined) {
    return null;
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${actorPath}.interactions debe ser un objeto.`);
  }
  const path = `${actorPath}.interactions`;
  rejectUnknownProperties(
    value,
    new Set(["approach_distance", "effects", "variants"]),
    path,
  );
  return {
    approachDistance: requiredCoordinate(
      value.approach_distance,
      `${path}.approach_distance`,
    ),
    effects: value.effects === undefined
      ? []
      : createGameActions(
        value.effects,
        gameState,
        dialogues,
        `${path}.effects`,
        items,
      ),
    variants: createActorInteractionVariants(
      value.variants,
      gameState,
      dialogues,
      items,
      `${path}.variants`,
    ),
  };
}

function rejectUnknownProperties(value, supportedProperties, path) {
  const unknown = Object.keys(value).filter((property) => !supportedProperties.has(property));
  if (unknown.length > 0) {
    throw new Error(`${path} contiene propiedades desconocidas: ${unknown.join(", ")}.`);
  }
}

function requiredText(value, path) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${path} debe ser un texto no vacío.`);
  }
  return value.trim();
}

function requiredCoordinate(value, path) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${path} debe ser un número mayor o igual que cero.`);
  }
  return value;
}

function requiredDimension(value, path) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${path} debe ser un número mayor que cero.`);
  }
  return value;
}
