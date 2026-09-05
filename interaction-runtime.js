import { resolveActorInteractionEffects } from "./actor-interaction-variants.js";
import { hotspotIsEnabled } from "./hotspot-availability.js";

export function createInteractionRuntime() {
  return { pendingInteraction: null };
}

export function setPendingInteraction(runtime, targetType, targetId, itemId = null) {
  if (targetType !== "hotspot" && targetType !== "actor") {
    throw new Error(`Tipo de objetivo de interacción no soportado: ${targetType}.`);
  }
  runtime.pendingInteraction = { targetType, targetId, itemId };
  return runtime.pendingInteraction;
}

export function cancelPendingInteraction(runtime) {
  runtime.pendingInteraction = null;
}

export function takePendingInteraction(runtime) {
  const pendingInteraction = runtime.pendingInteraction;
  runtime.pendingInteraction = null;
  return pendingInteraction;
}

export function capturedItemForTarget(
  targetType,
  targetId,
  selectedItemId,
  useInteraction,
) {
  return useInteraction !== null
    && selectedItemId === useInteraction.itemId
    && targetType === useInteraction.targetType
    && targetId === useInteraction.targetId
    ? selectedItemId
    : null;
}

export function resolvePendingInteraction(
  pendingInteraction,
  sceneModel,
  useInteraction,
  gameState,
  actorsRuntime = {},
) {
  const target = resolveTarget(
    pendingInteraction,
    sceneModel,
    actorsRuntime,
    gameState,
  );

  if (pendingInteraction.itemId !== null) {
    if (!gameState.inventory.includes(pendingInteraction.itemId)) {
      throw new Error(
        `El objeto ${pendingInteraction.itemId} ya no está en el inventario.`,
      );
    }
    if (
      useInteraction === null
      || useInteraction.itemId !== pendingInteraction.itemId
      || useInteraction.targetType !== pendingInteraction.targetType
      || useInteraction.targetId !== pendingInteraction.targetId
    ) {
      throw new Error("La interacción pendiente ya no es válida.");
    }
    return {
      effects: useInteraction.effects,
      successMessage: `${pendingInteraction.itemId} usado sobre ${target.id}.`,
    };
  }

  const effects = target.actor === undefined
    ? target.effects
    : resolveActorInteractionEffects(target.actor, gameState);
  return {
    effects,
    successMessage: effects.length > 0
      ? `${target.label} activado: ${target.id}.`
      : `${target.label} ${target.id} no tiene una acción directa.`,
  };
}

function resolveTarget(pendingInteraction, sceneModel, actorsRuntime, gameState) {
  if (pendingInteraction.targetType === "hotspot") {
    const hotspot = sceneModel.hotspots.find(
      (candidate) => candidate.id === pendingInteraction.targetId,
    );
    if (hotspot === undefined) {
      throw new Error(`El hotspot pendiente ${pendingInteraction.targetId} ya no existe.`);
    }
    if (!hotspotIsEnabled(hotspot, gameState)) {
      throw new Error(`El hotspot ${hotspot.id} está deshabilitado.`);
    }
    return { id: hotspot.id, label: "Hotspot", effects: hotspot.effects };
  }
  if (pendingInteraction.targetType === "actor") {
    const actor = sceneModel.actors.find(
      (candidate) => candidate.id === pendingInteraction.targetId,
    );
    if (actor === undefined || actorsRuntime[actor.id] === undefined) {
      throw new Error(`El actor pendiente ${pendingInteraction.targetId} ya no existe.`);
    }
    return {
      id: actor.id,
      label: "Actor",
      actor,
    };
  }
  throw new Error(`Tipo de objetivo pendiente no soportado: ${pendingInteraction.targetType}.`);
}
