import { isSceneElementVisible } from "./element-visibility.js";
import { hotspotIsEnabled } from "./hotspot-availability.js";

export function sceneObjectIsAvailable(sceneObject, sceneModel, gameState) {
  const element = sceneModel.elements.find(
    (candidate) => candidate.id === sceneObject.elementId,
  );
  const hotspot = sceneModel.hotspots.find(
    (candidate) => candidate.id === sceneObject.hotspotId,
  );
  return element !== undefined
    && hotspot !== undefined
    && isSceneElementVisible(element, gameState)
    && hotspotIsEnabled(hotspot, gameState);
}
