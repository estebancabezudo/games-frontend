import { createSceneActor } from "./actor-model.js";
import { resolveSceneElementVariant } from "./element-variants.js";
import { createFlagCondition } from "./flag-condition.js";
import { createGameActions } from "./game-actions.js";
import { createHotspotAvailability } from "./hotspot-availability.js";
import {
  createDialogueModel,
  validateDialogueActors,
} from "./dialogue-model.js";
import { createDepthScale } from "./scene-depth.js";
import { createSvgAssetPath } from "./svg-asset.js";
import { createWalkModel } from "./walk-model.js";
import { createUseInteraction } from "./interaction-model.js";
import { createSceneObjects } from "./scene-object-model.js";
import { actorFacingIsSupported } from "./actor-facing.js";
import { createSceneEntries } from "./scene-entry-model.js";

const SUPPORTED_ORIENTATIONS = new Set(["portrait", "landscape"]);

export function createSceneModel(definition, gameState, items = [], context = {}) {
  const { scene, gameId } = sceneDefinition(definition, context);
  if (scene?.proximity !== undefined) {
    throw new Error("proximity ya no está soportado por el DSL.");
  }
  const dialogues = createDialogueModel(scene?.dialogues);
  const actorModel = sceneActors(scene, gameState, dialogues, items);
  validateDialogueActors(dialogues, actorModel.actors);
  const elements = sceneElements(scene?.elements, gameState);
  const hotspots = sceneHotspots(
    scene?.hotspots,
    gameState,
    dialogues,
    items,
    context.sceneIds,
    actorModel.controlledActor,
  );
  const model = {
    gameId,
    sceneId: requiredText(scene?.id, "scene.id"),
    orientation: requiredOrientation(scene?.viewport?.orientation),
    size: {
      width: requiredDimension(scene?.size?.width, "size.width"),
      height: requiredDimension(scene?.size?.height, "size.height"),
    },
    backgroundColor: requiredText(scene?.background?.color, "background.color"),
    depthScale: createDepthScale(scene?.depth),
    actors: actorModel.actors,
    controlledActorId: actorModel.controlledActorId,
    character: actorModel.controlledActor,
    entries: createSceneEntries(scene?.entries, actorModel.controlledActor),
    dialogues,
    items,
    walk: createWalkModel(scene?.walk, gameState, dialogues, items, context.sceneIds),
    elements,
    hotspots,
    objects: createSceneObjects(
      scene?.objects,
      elements,
      hotspots,
      gameState,
      dialogues,
      items,
    ),
  };
  model.useInteraction = createUseInteraction(scene, model, gameState);
  return model;
}

function sceneDefinition(definition, context) {
  if (definition?.scene !== undefined) {
    return {
      scene: { ...definition, id: definition.scene?.id },
      gameId: requiredText(definition?.game?.id, "game.id"),
    };
  }
  return {
    scene: definition,
    gameId: requiredText(context.gameId, "game.id"),
  };
}

function sceneActors(document, gameState, dialogues, items) {
  const hasCharacter = document?.character !== undefined;
  const hasActors = document?.actors !== undefined;
  if (hasCharacter && hasActors) {
    throw new Error("La escena no puede declarar character y actors al mismo tiempo.");
  }
  if (hasCharacter) {
    const actor = createSceneActor(document.character, "character", gameState, dialogues, items);
    if (actor.movement !== null) {
      throw new Error("character no puede declarar movement autónomo.");
    }
    return {
      actors: [actor],
      controlledActorId: actor.id,
      controlledActor: actor,
    };
  }
  if (!hasActors) {
    return { actors: [], controlledActorId: null, controlledActor: null };
  }
  if (!Array.isArray(document.actors) || document.actors.length === 0) {
    throw new Error("actors debe ser una lista no vacía.");
  }
  const ids = new Set();
  const actors = document.actors.map((actor, index) => {
    const model = createSceneActor(actor, `actors[${index}]`, gameState, dialogues, items);
    if (ids.has(model.id)) {
      throw new Error(`actors contiene un id duplicado: ${model.id}.`);
    }
    ids.add(model.id);
    return model;
  });
  const controlledActorId = requiredText(document.controlled_actor, "controlled_actor");
  const controlledActor = actors.find((actor) => actor.id === controlledActorId);
  if (controlledActor === undefined) {
    throw new Error(`controlled_actor debe referir a un actor existente: ${controlledActorId}.`);
  }
  if (controlledActor.movement !== null) {
    throw new Error("controlled_actor no puede declarar movement autónomo.");
  }
  return { actors, controlledActorId, controlledActor };
}

function sceneHotspots(value, gameState, dialogues, items, sceneIds, controlledActor) {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error("hotspots debe ser una lista.");
  }

  return value.map((hotspot, index) => {
    const path = `hotspots[${index}]`;

    return {
      id: requiredText(hotspot?.id, `${path}.id`),
      enabledWhen: createHotspotAvailability(
        hotspot?.enabled_when,
        gameState,
        `${path}.enabled_when`,
      ),
      area: {
        x: requiredCoordinate(hotspot?.area?.x, `${path}.area.x`),
        y: requiredCoordinate(hotspot?.area?.y, `${path}.area.y`),
        width: requiredDimension(hotspot?.area?.width, `${path}.area.width`),
        height: requiredDimension(hotspot?.area?.height, `${path}.area.height`),
      },
      approach: sceneHotspotApproach(hotspot.approach, controlledActor, path),
      effects: hotspot.effects === undefined
        ? []
        : createGameActions(
          hotspot.effects,
          gameState,
          dialogues,
          `${path}.effects`,
          items,
          { allowChangeScene: true, sceneIds },
        ),
    };
  });
}

function sceneHotspotApproach(value, controlledActor, hotspotPath) {
  if (value === undefined) {
    return null;
  }
  const path = `${hotspotPath}.approach`;
  return {
    x: requiredCoordinate(value?.x, `${path}.x`),
    y: requiredCoordinate(value?.y, `${path}.y`),
    facing: value?.facing === undefined
      ? null
      : requiredApproachFacing(value.facing, controlledActor, `${path}.facing`),
  };
}

function requiredApproachFacing(value, controlledActor, path) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${path} debe ser un texto no vacío.`);
  }
  const facing = value.trim();
  if (controlledActor === null) {
    throw new Error(`${path} requiere que la escena tenga un actor controlado.`);
  }
  const directions = controlledActor.visual.directions;
  if (!actorFacingIsSupported(facing, directions)) {
    throw new Error(
      `${path} no es compatible con el actor controlado de ${directions} direcciones: ${facing}.`,
    );
  }
  return facing;
}

function sceneElements(value, gameState) {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error("elements debe ser una lista.");
  }

  return value.map((element, index) => {
    const path = `elements[${index}]`;
    const sceneElement = {
      id: requiredText(element?.id, `${path}.id`),
      x: requiredCoordinate(element?.x, `${path}.x`),
      y: requiredCoordinate(element?.y, `${path}.y`),
      width: requiredDimension(element?.width, `${path}.width`),
      height: requiredDimension(element?.height, `${path}.height`),
      z: element.z === undefined ? 0 : requiredZ(element.z, `${path}.z`),
      depthY: element.depth_y === undefined
        ? null
        : requiredCoordinate(element.depth_y, `${path}.depth_y`),
      ...elementVisual(element, path),
      visibleWhen: element.visible_when === undefined
        ? null
        : createFlagCondition(element.visible_when, gameState, `${path}.visible_when`),
      variants: sceneElementVariants(element?.variants, gameState, `${path}.variants`),
    };
    resolveSceneElementVariant(sceneElement, gameState);
    return sceneElement;
  });
}

function sceneElementVariants(value, gameState, path) {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error(`${path} debe ser una lista.`);
  }

  return value.map((variant, index) => {
    const variantPath = `${path}[${index}]`;
    const definition = requiredObject(variant, variantPath);
    const unsupportedProperties = Object.keys(definition).filter((property) => (
      !["when", "x", "y", "width", "height", "color", "asset", "z"].includes(property)
    ));
    if (unsupportedProperties.length > 0) {
      throw new Error(`${variantPath} contiene propiedades no soportadas: ${unsupportedProperties.join(", ")}.`);
    }

    const properties = variantProperties(definition, variantPath);
    if (Object.keys(properties).length === 0) {
      throw new Error(`${variantPath} debe sobrescribir al menos una propiedad visual.`);
    }

    return {
      when: createFlagCondition(definition.when, gameState, `${variantPath}.when`),
      properties,
    };
  });
}

function variantProperties(variant, path) {
  const properties = {};
  if (Object.hasOwn(variant, "color") && Object.hasOwn(variant, "asset")) {
    throw new Error(`${path} no puede declarar color y asset al mismo tiempo.`);
  }
  if (Object.hasOwn(variant, "x")) {
    properties.x = requiredCoordinate(variant.x, `${path}.x`);
  }
  if (Object.hasOwn(variant, "y")) {
    properties.y = requiredCoordinate(variant.y, `${path}.y`);
  }
  if (Object.hasOwn(variant, "width")) {
    properties.width = requiredDimension(variant.width, `${path}.width`);
  }
  if (Object.hasOwn(variant, "height")) {
    properties.height = requiredDimension(variant.height, `${path}.height`);
  }
  if (Object.hasOwn(variant, "color")) {
    properties.color = requiredText(variant.color, `${path}.color`);
  }
  if (Object.hasOwn(variant, "asset")) {
    properties.asset = createSvgAssetPath(variant.asset, `${path}.asset`);
  }
  if (Object.hasOwn(variant, "z")) {
    properties.z = requiredZ(variant.z, `${path}.z`);
  }
  return properties;
}

function elementVisual(element, path) {
  const hasColor = Object.hasOwn(element, "color");
  const hasAsset = Object.hasOwn(element, "asset");
  if (hasColor && hasAsset) {
    throw new Error(`${path} no puede declarar color y asset al mismo tiempo.`);
  }
  if (!hasColor && !hasAsset) {
    throw new Error(`${path} debe declarar color o asset.`);
  }

  return {
    color: hasColor ? requiredText(element.color, `${path}.color`) : null,
    asset: hasAsset ? createSvgAssetPath(element.asset, `${path}.asset`) : null,
  };
}

function requiredText(value, path) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${path} debe ser un texto no vacío.`);
  }
  return value.trim();
}

function requiredObject(value, path) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} debe ser un objeto.`);
  }
  return value;
}

function requiredOrientation(value) {
  if (!SUPPORTED_ORIENTATIONS.has(value)) {
    throw new Error("viewport.orientation debe ser portrait o landscape.");
  }
  return value;
}

function requiredDimension(value, path) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${path} debe ser un número mayor que cero.`);
  }
  return value;
}

function requiredCoordinate(value, path) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${path} debe ser un número mayor o igual que cero.`);
  }
  return value;
}

function requiredZ(value, path) {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) {
    throw new Error(`${path} debe ser un número entero.`);
  }
  return value;
}
