import { createSvgAssetPath } from "./svg-asset.js";

const REQUIRED_VISUAL_STATES = ["idle", "walking"];
const SUPPORTED_VISUAL_STATES = new Set([...REQUIRED_VISUAL_STATES, "talking"]);
const DIRECTION_NAMES = new Map([
  [1, ["default"]],
  [2, ["left", "right"]],
  [4, ["up", "right", "down", "left"]],
  [8, [
    "up",
    "up_right",
    "right",
    "down_right",
    "down",
    "down_left",
    "left",
    "up_left",
  ]],
]);

export function createCharacterVisual(character, path = "character") {
  if (character.visual === undefined) {
    const representations = {
      default: staticRepresentation(character.asset, `${path}.asset`),
    };
    return normalizedVisual(1, representations, representations);
  }
  if (Object.hasOwn(character, "asset")) {
    throw new Error(`${path} no puede declarar asset y visual al mismo tiempo.`);
  }

  const visualPath = `${path}.visual`;
  const visual = requiredObject(character.visual, visualPath);
  rejectUnknownProperties(
    visual,
    new Set(["directions", "asset", "assets", "states"]),
    visualPath,
  );
  const directions = requiredDirections(visual.directions, `${visualPath}.directions`);
  const representations = ["asset", "assets", "states"].filter(
    (property) => Object.hasOwn(visual, property),
  );
  if (representations.length !== 1) {
    throw new Error(
      `${visualPath} debe declarar exactamente uno de asset, assets o states.`,
    );
  }

  if (representations[0] === "asset") {
    if (directions !== 1) {
      throw new Error(`${visualPath}.asset sólo es válido con directions: 1.`);
    }
    const representations = {
      default: staticRepresentation(visual.asset, `${visualPath}.asset`),
    };
    return normalizedVisual(directions, representations, representations);
  }

  if (representations[0] === "assets") {
    if (directions === 1) {
      throw new Error(`${visualPath}.assets no es válido con directions: 1.`);
    }
    const assets = directionalAssets(
      visual.assets,
      directions,
      `${visualPath}.assets`,
    );
    return normalizedVisual(directions, assets, assets);
  }

  return visualStates(visual.states, directions, `${visualPath}.states`);
}

export function resolveActorVisual(visual, visualState, facing) {
  if (!SUPPORTED_VISUAL_STATES.has(visualState)) {
    throw new Error(`Estado visual del actor no soportado: ${visualState}.`);
  }
  const representations = visual.states[visualState] ?? visual.states.idle;
  return visual.directions === 1
    ? representations.default
    : representations[facing];
}

export function resolveActorVisualState(visual, motion, visualStateOverride) {
  if (visualStateOverride === null || visualStateOverride === undefined) {
    return motion;
  }
  if (visualStateOverride !== "talking") {
    throw new Error(`Override visual del actor no soportado: ${visualStateOverride}.`);
  }
  return visual.states.talking === undefined ? "idle" : "talking";
}

export function resolveCharacterAsset(visual, facing) {
  const representation = resolveActorVisual(visual, "idle", facing);
  return representation.type === "asset"
    ? representation.asset
    : representation.frames[0];
}

export function createActorVisualStates(value, directions, path) {
  requiredDirections(directions, `${path}.directions`);
  return visualStates(value, directions, path);
}

function visualStates(value, directions, path) {
  const states = requiredObject(value, path);
  rejectUnknownProperties(
    states,
    SUPPORTED_VISUAL_STATES,
    path,
  );
  REQUIRED_VISUAL_STATES.forEach((visualState) => {
    if (!Object.hasOwn(states, visualState)) {
      throw new Error(`${path} debe declarar el estado ${visualState}.`);
    }
  });

  return normalizedVisual(
    directions,
    stateAssets(states.idle, directions, `${path}.idle`),
    stateAssets(states.walking, directions, `${path}.walking`),
    states.talking === undefined
      ? null
      : stateAssets(states.talking, directions, `${path}.talking`),
  );
}

function stateAssets(value, directions, path) {
  if (directions === 1) {
    return {
      default: visualRepresentation(value, path),
    };
  }
  return directionalAssets(value, directions, path);
}

function directionalAssets(value, directions, path) {
  const assets = requiredObject(value, path);
  const directionNames = DIRECTION_NAMES.get(directions);
  rejectUnknownProperties(assets, new Set(directionNames), path);
  directionNames.forEach((direction) => {
    if (!Object.hasOwn(assets, direction)) {
      throw new Error(`${path} debe declarar la dirección ${direction}.`);
    }
  });
  return Object.fromEntries(directionNames.map((direction) => [
    direction,
    visualRepresentation(assets[direction], `${path}.${direction}`),
  ]));
}

function visualRepresentation(value, path) {
  if (typeof value === "string") {
    return staticRepresentation(value, path);
  }
  const representation = requiredObject(value, path);
  rejectUnknownProperties(representation, new Set(["asset", "animation"]), path);
  const types = ["asset", "animation"].filter(
    (property) => Object.hasOwn(representation, property),
  );
  if (types.length !== 1) {
    throw new Error(`${path} debe declarar exactamente asset o animation.`);
  }
  if (types[0] === "asset") {
    return staticRepresentation(representation.asset, `${path}.asset`);
  }

  const animation = requiredObject(representation.animation, `${path}.animation`);
  rejectUnknownProperties(
    animation,
    new Set(["frames", "fps", "loop"]),
    `${path}.animation`,
  );
  if (!Array.isArray(animation.frames) || animation.frames.length < 2) {
    throw new Error(`${path}.animation.frames debe contener al menos 2 assets.`);
  }
  if (typeof animation.fps !== "number" || !Number.isFinite(animation.fps) || animation.fps <= 0) {
    throw new Error(`${path}.animation.fps debe ser un número mayor que cero.`);
  }
  if (animation.loop !== undefined && typeof animation.loop !== "boolean") {
    throw new Error(`${path}.animation.loop debe ser booleano.`);
  }
  return {
    type: "animation",
    frames: animation.frames.map((frame, index) => createSvgAssetPath(
      frame,
      `${path}.animation.frames[${index}]`,
    )),
    fps: animation.fps,
    loop: animation.loop ?? true,
  };
}

function staticRepresentation(value, path) {
  return {
    type: "asset",
    asset: createSvgAssetPath(value, path),
  };
}

function normalizedVisual(directions, idleAssets, walkingAssets, talkingAssets = null) {
  return {
    directions,
    states: {
      idle: idleAssets,
      walking: walkingAssets,
      ...(talkingAssets === null ? {} : { talking: talkingAssets }),
    },
  };
}

function requiredDirections(value, path) {
  if (!DIRECTION_NAMES.has(value)) {
    throw new Error(`${path} debe ser 1, 2, 4 u 8.`);
  }
  return value;
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
