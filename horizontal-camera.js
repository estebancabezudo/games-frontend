export function calculateViewportWorldWidth(sceneSize, physicalViewportSize) {
  if (physicalViewportSize.width <= 0 || physicalViewportSize.height <= 0) {
    return sceneSize.width;
  }
  const visibleWidth = sceneSize.height
    * physicalViewportSize.width
    / physicalViewportSize.height;
  return Math.min(sceneSize.width, visibleWidth);
}

export function createHorizontalCameraRuntime(
  sceneSize,
  viewportWorldWidth,
  characterWorldX,
) {
  const camera = {
    x: 0,
    viewportWorldWidth,
  };
  followCharacterHorizontally(camera, characterWorldX, sceneSize.width);
  return camera;
}

export function updateHorizontalCameraViewport(
  camera,
  viewportWorldWidth,
  characterWorldX,
  sceneWidth,
) {
  camera.viewportWorldWidth = Math.min(sceneWidth, viewportWorldWidth);
  followCharacterHorizontally(camera, characterWorldX, sceneWidth);
}

export function followCharacterHorizontally(camera, characterWorldX, sceneWidth) {
  const maximumCameraX = Math.max(0, sceneWidth - camera.viewportWorldWidth);
  const desiredCameraX = characterWorldX - camera.viewportWorldWidth / 2;
  camera.x = clamp(desiredCameraX, 0, maximumCameraX);
  return camera.x;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}
