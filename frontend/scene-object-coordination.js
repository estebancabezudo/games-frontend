import { clearSceneObjectInteraction } from "./scene-object-runtime.js";

export function beginFreeNavigation(runtime, startNavigation) {
  return beginNonObjectIntent(runtime, startNavigation);
}

export function beginActorInteraction(runtime, startInteraction) {
  return beginNonObjectIntent(runtime, startInteraction);
}

export function beginNormalHotspotInteraction(runtime, startInteraction) {
  return beginNonObjectIntent(runtime, startInteraction);
}

export function hotspotActivationTarget(sceneModel, hotspotId) {
  const sceneObject = sceneModel.objects.find(
    (candidate) => candidate.hotspotId === hotspotId,
  );
  return sceneObject === undefined
    ? { type: "hotspot" }
    : { type: "scene-object", sceneObject };
}

function beginNonObjectIntent(runtime, startIntent) {
  clearSceneObjectInteraction(runtime);
  return startIntent();
}
