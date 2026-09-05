import { sceneObjectIsAvailable } from "./scene-object-availability.js";
import { sceneObjectActionIsAvailable } from "./scene-object-action-availability.js";

export function resolveSelectedSceneObjectAction(
  sceneModel,
  gameState,
  runtime,
  objectId,
  actionId,
) {
  if (runtime.selectedObjectId !== objectId) {
    throw new Error(`El objeto ${objectId} no es el objeto seleccionado.`);
  }
  const sceneObject = sceneModel.objects.find((candidate) => candidate.id === objectId);
  if (sceneObject === undefined) {
    throw new Error(`El objeto seleccionado ${objectId} ya no existe.`);
  }
  if (!sceneObjectIsAvailable(sceneObject, sceneModel, gameState)) {
    throw new Error(`El objeto ${sceneObject.name} ya no está disponible.`);
  }
  const action = sceneObject.actions.find((candidate) => candidate.id === actionId);
  if (action === undefined) {
    throw new Error(`La acción ${actionId} ya no pertenece al objeto ${objectId}.`);
  }
  if (!sceneObjectActionIsAvailable(action, gameState)) {
    throw new Error(`La acción ${action.label} ya no está disponible para ${sceneObject.name}.`);
  }
  return { sceneObject, action };
}
