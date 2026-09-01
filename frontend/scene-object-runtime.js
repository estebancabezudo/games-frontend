import { sceneObjectIsAvailable } from "./scene-object-availability.js";

export function createSceneObjectInteractionRuntime() {
  return {
    pendingObjectId: null,
    activeLocationId: null,
    selectedObjectId: null,
  };
}

export function clearSceneObjectInteraction(runtime) {
  runtime.pendingObjectId = null;
  runtime.activeLocationId = null;
  runtime.selectedObjectId = null;
}

export function setPendingSceneObject(runtime, objectId) {
  clearSceneObjectInteraction(runtime);
  runtime.pendingObjectId = objectId;
}

export function completePendingSceneObject(runtime, sceneModel, gameState) {
  const objectId = runtime.pendingObjectId;
  if (objectId === null) {
    return null;
  }
  const sceneObject = sceneModel.objects.find((candidate) => candidate.id === objectId);
  runtime.pendingObjectId = null;
  if (sceneObject === undefined) {
    clearSceneObjectInteraction(runtime);
    throw new Error(`El objeto pendiente ${objectId} ya no existe.`);
  }
  if (!sceneObjectIsAvailable(sceneObject, sceneModel, gameState)) {
    clearSceneObjectInteraction(runtime);
    throw new Error(`El objeto ${sceneObject.id} ya no está disponible.`);
  }
  runtime.activeLocationId = sceneObject.locationId;
  runtime.selectedObjectId = sceneObject.id;
  return sceneObject;
}

export function availableSceneObjects(sceneModel, gameState, runtime) {
  if (runtime.activeLocationId === null) {
    return [];
  }
  return sceneModel.objects.filter((sceneObject) => {
    if (sceneObject.locationId !== runtime.activeLocationId) {
      return false;
    }
    return sceneObjectIsAvailable(sceneObject, sceneModel, gameState);
  });
}

export function synchronizeSceneObjectSelection(runtime, availableObjects) {
  if (!availableObjects.some((sceneObject) => (
    sceneObject.id === runtime.selectedObjectId
  ))) {
    runtime.selectedObjectId = null;
  }
  return runtime.selectedObjectId;
}

export function reconcileSceneObjectContext(runtime, availableObjects) {
  synchronizeSceneObjectSelection(runtime, availableObjects);
  if (runtime.activeLocationId !== null && availableObjects.length === 0) {
    clearSceneObjectInteraction(runtime);
  }
  return runtime;
}

export function selectSceneObject(runtime, objectId, availableObjects) {
  if (!availableObjects.some((sceneObject) => sceneObject.id === objectId)) {
    throw new Error(`El objeto ${objectId} no está disponible en la location activa.`);
  }
  runtime.selectedObjectId = objectId;
  return objectId;
}
