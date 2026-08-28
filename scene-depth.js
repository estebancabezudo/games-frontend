export function createDepthScale(value) {
  if (value === undefined) {
    return null;
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("depth debe ser un objeto.");
  }
  if (value.scale === undefined) {
    return null;
  }
  if (value.scale === null || typeof value.scale !== "object" || Array.isArray(value.scale)) {
    throw new Error("depth.scale debe ser un objeto.");
  }

  const scale = {
    nearY: requiredCoordinate(value.scale.near_y, "depth.scale.near_y"),
    nearScale: requiredScale(value.scale.near_scale, "depth.scale.near_scale"),
    farY: requiredCoordinate(value.scale.far_y, "depth.scale.far_y"),
    farScale: requiredScale(value.scale.far_scale, "depth.scale.far_scale"),
  };
  if (scale.nearY <= scale.farY) {
    throw new Error("depth.scale.near_y debe ser mayor que depth.scale.far_y.");
  }
  return scale;
}

export function calculateCharacterScale(positionY, depthScale) {
  if (depthScale === null) {
    return 1;
  }

  const clampedY = Math.min(depthScale.nearY, Math.max(depthScale.farY, positionY));
  const progress = (clampedY - depthScale.farY) / (depthScale.nearY - depthScale.farY);
  return depthScale.farScale
    + (depthScale.nearScale - depthScale.farScale) * progress;
}

export function compareCharacterToElement(character, element) {
  return compareActorToElement(character, element);
}

export function compareActorToElement(actor, element) {
  if (element.depthY === null) {
    return null;
  }
  if (actor.position.y < element.depthY) {
    return "behind";
  }
  if (actor.position.y > element.depthY) {
    return "in-front";
  }
  return "aligned";
}

export function characterRenderIndex(sortedElements, character) {
  return actorRenderIndex(sortedElements, character);
}

export function actorRenderIndex(sortedElements, actor) {
  let firstBehindIndex = null;
  let lastInFrontIndex = null;

  sortedElements.forEach((element, index) => {
    const relation = compareActorToElement(actor, element);
    if (relation === "behind" && firstBehindIndex === null) {
      firstBehindIndex = index;
    }
    if (relation === "in-front") {
      lastInFrontIndex = index;
    }
  });

  if (firstBehindIndex !== null) {
    return firstBehindIndex;
  }
  if (lastInFrontIndex !== null) {
    return lastInFrontIndex + 1;
  }
  return sortedElements.length;
}

export function orderActorsByDepth(actors, actorsRuntime) {
  return actors
    .map((actor, declarationIndex) => ({
      actor,
      runtime: actorsRuntime[actor.id],
      declarationIndex,
    }))
    .sort((left, right) => (
      left.runtime.position.y - right.runtime.position.y
      || left.declarationIndex - right.declarationIndex
    ));
}

function requiredCoordinate(value, path) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${path} debe ser un número mayor o igual que cero.`);
  }
  return value;
}

function requiredScale(value, path) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${path} debe ser un número mayor que cero.`);
  }
  return value;
}
