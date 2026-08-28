import { createGameActions } from "./game-actions.js";
import { requireCatalogItem } from "./item-model.js";

export function createUseInteraction(document, sceneModel, gameState) {
  if (document?.interaction === undefined) {
    return null;
  }

  const itemId = requiredText(document.interaction?.use?.item, "interaction.use.item");
  const target = interactionTarget(document.interaction?.use, sceneModel);
  requireCatalogItem(sceneModel.items ?? [], itemId, "interaction.use.item");

  return {
    itemId,
    ...target,
    effects: createGameActions(
      document.interaction.effects,
      gameState,
      sceneModel.dialogues,
      "interaction.effects",
      sceneModel.items ?? [],
    ),
  };
}

function interactionTarget(use, sceneModel) {
  const hasHotspot = use?.on !== undefined;
  const hasActor = use?.on_actor !== undefined;
  if (hasHotspot === hasActor) {
    throw new Error("interaction.use debe declarar exactamente uno de on u on_actor.");
  }
  if (hasHotspot) {
    const targetId = requiredText(use.on, "interaction.use.on");
    if (!sceneModel.hotspots.some((hotspot) => hotspot.id === targetId)) {
      throw new Error(`interaction.use.on debe identificar un hotspot: ${targetId}.`);
    }
    return { targetType: "hotspot", targetId };
  }

  const targetId = requiredText(use.on_actor, "interaction.use.on_actor");
  const actor = sceneModel.actors.find((candidate) => candidate.id === targetId);
  if (actor === undefined) {
    throw new Error(`interaction.use.on_actor debe identificar un actor: ${targetId}.`);
  }
  if (targetId === sceneModel.controlledActorId) {
    throw new Error("interaction.use.on_actor no puede referir al controlled_actor.");
  }
  if (actor.interactions === null) {
    throw new Error(`El actor ${targetId} debe declarar interactions para recibir objetos.`);
  }
  return { targetType: "actor", targetId };
}

function requiredText(value, path) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${path} debe ser un texto no vacío.`);
  }
  return value.trim();
}
