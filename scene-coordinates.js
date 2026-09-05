export function screenPointToCanvas(screenPoint, canvasBounds) {
  return {
    x: screenPoint.x - canvasBounds.left,
    y: screenPoint.y - canvasBounds.top,
  };
}

export function canvasPointToWorld(
  canvasPoint,
  canvasSize,
  viewportWorldSize,
  cameraX = 0,
  sceneSize = viewportWorldSize,
) {
  const viewportX = canvasPoint.x / canvasSize.width * viewportWorldSize.width;
  const worldX = cameraX + viewportX;
  const worldY = canvasPoint.y / canvasSize.height * viewportWorldSize.height;
  return {
    x: clamp(worldX, 0, sceneSize.width),
    y: clamp(worldY, 0, sceneSize.height),
  };
}

export function screenPointToWorld(
  screenPoint,
  canvasBounds,
  viewportWorldSize,
  cameraX = 0,
  sceneSize = viewportWorldSize,
) {
  const canvasPoint = screenPointToCanvas(screenPoint, canvasBounds);
  return canvasPointToWorld(
    canvasPoint,
    { width: canvasBounds.width, height: canvasBounds.height },
    viewportWorldSize,
    cameraX,
    sceneSize,
  );
}

export function worldPointToScreen(worldPoint, cameraX) {
  return {
    x: worldPoint.x - cameraX,
    y: worldPoint.y,
  };
}

export function screenPointToWorldLogical(screenPoint, cameraX) {
  return {
    x: cameraX + screenPoint.x,
    y: screenPoint.y,
  };
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}
