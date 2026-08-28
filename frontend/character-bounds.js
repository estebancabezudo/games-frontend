import { calculateCharacterScale } from "./scene-depth.js";

const BOUNDS_SEARCH_STEPS = 60;

export function constrainCharacterPosition(
  character,
  depthScale,
  sceneSize,
  requestedPosition,
) {
  const y = constrainVerticalPosition(
    character,
    depthScale,
    sceneSize.height,
    requestedPosition.y,
  );
  const scale = calculateCharacterScale(y, depthScale);
  const renderedWidth = character.size.width * scale;
  const minimumX = renderedWidth / 2;
  const maximumX = sceneSize.width - renderedWidth / 2;
  const x = minimumX <= maximumX
    ? clamp(requestedPosition.x, minimumX, maximumX)
    : sceneSize.width / 2;

  return { x, y };
}

function constrainVerticalPosition(character, depthScale, sceneHeight, requestedY) {
  const clampedY = clamp(requestedY, 0, sceneHeight);
  if (fitsVertically(character, depthScale, clampedY)) {
    return clampedY;
  }
  if (!fitsVertically(character, depthScale, sceneHeight)) {
    return sceneHeight;
  }

  let invalidY = clampedY;
  let validY = sceneHeight;
  for (let step = 0; step < BOUNDS_SEARCH_STEPS; step += 1) {
    const candidateY = (invalidY + validY) / 2;
    if (fitsVertically(character, depthScale, candidateY)) {
      validY = candidateY;
    } else {
      invalidY = candidateY;
    }
  }
  return validY;
}

function fitsVertically(character, depthScale, positionY) {
  const scale = calculateCharacterScale(positionY, depthScale);
  const renderedHeight = character.size.height * scale;
  return positionY - renderedHeight >= 0;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}
