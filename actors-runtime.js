import { createCharacterRuntime } from "./character-runtime.js";
import { createAutonomousMovementRuntime } from "./actor-patrol.js";
import { followCharacterHorizontally } from "./horizontal-camera.js";

export function createActorsRuntime(actors, sceneSize, depthScale) {
  return Object.fromEntries(actors.map((actor) => {
    const runtime = createCharacterRuntime(actor, sceneSize, depthScale);
    runtime.autonomousMovement = createAutonomousMovementRuntime(actor.movement ?? null);
    return [actor.id, runtime];
  }));
}

export function controlledActorRuntime(actorsRuntime, controlledActorId) {
  return controlledActorId === null ? null : actorsRuntime[controlledActorId] ?? null;
}

export function followControlledActorHorizontally(
  camera,
  actorsRuntime,
  controlledActorId,
  updatedActorId,
  sceneWidth,
) {
  if (updatedActorId !== controlledActorId) {
    return camera.x;
  }
  return followCharacterHorizontally(
    camera,
    actorsRuntime[controlledActorId].position.x,
    sceneWidth,
  );
}
