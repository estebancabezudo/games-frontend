import {
  constrainCharacterRuntimePosition,
  setCharacterFacing,
} from "./character-runtime.js";
import { sceneEntryById } from "./scene-entry-model.js";

export function applySceneEntry(sceneModel, actorsRuntime, entryId) {
  if (entryId === null || entryId === undefined) {
    return null;
  }
  const entry = sceneEntryById(sceneModel, entryId);
  if (entry === null) {
    throw new Error(`No existe la entrada ${entryId} en la escena ${sceneModel.sceneId}.`);
  }
  const runtime = actorsRuntime[sceneModel.controlledActorId];
  if (runtime === undefined) {
    throw new Error(`La escena ${sceneModel.sceneId} no tiene runtime de actor controlado.`);
  }

  runtime.position = {
    ...constrainCharacterRuntimePosition(runtime, entry.position),
  };
  runtime.route = [];
  runtime.destination = null;
  runtime.motion = "idle";
  if (entry.facing !== null) {
    setCharacterFacing(runtime, entry.facing);
  }
  return runtime;
}
