import { controlledActorRuntime, createActorsRuntime } from "./actors-runtime.js";
import { createDialogueRuntime } from "./dialogue-runtime.js";
import { createDialogueSessionRuntime } from "./dialogue-session.js";
import {
  cancelDialogueTalking,
  createDialogueTalkingRuntime,
} from "./dialogue-timing.js";
import { createInteractionRuntime } from "./interaction-runtime.js";
import { createWalkArrivalRuntime } from "./walk-arrival-runtime.js";

export function createSceneRuntimeResources(sceneModel) {
  const actorsRuntime = createActorsRuntime(
    sceneModel.actors,
    sceneModel.size,
    sceneModel.depthScale,
  );
  return {
    selectedInventoryItem: null,
    actorsRuntime,
    controlledActorRuntime: controlledActorRuntime(
      actorsRuntime,
      sceneModel.controlledActorId,
    ),
    actorMovements: new Map(),
    interactionRuntime: createInteractionRuntime(),
    walkArrivalRuntime: createWalkArrivalRuntime(),
    dialogueRuntime: createDialogueRuntime(),
    dialogueSession: createDialogueSessionRuntime(),
    dialogueTalkingRuntime: createDialogueTalkingRuntime(),
  };
}

export function disposeSceneRuntimeResources(resources, renderer = null) {
  if (resources === null) {
    renderer?.clear();
    return;
  }
  resources.actorMovements.forEach((movement) => movement.stop());
  Object.values(resources.actorsRuntime).forEach((runtime) => {
    runtime.destination = null;
    runtime.route = [];
    runtime.motion = "idle";
    runtime.visualStateOverride = null;
  });
  resources.actorMovements.clear();
  resources.interactionRuntime.pendingInteraction = null;
  resources.walkArrivalRuntime.pendingWalkArrival = null;
  resources.dialogueRuntime.currentDialogue = null;
  cancelDialogueTalking(resources.dialogueTalkingRuntime);
  resources.dialogueSession.participantIds = [];
  resources.dialogueSession.speakerId = null;
  renderer?.clear();
}
