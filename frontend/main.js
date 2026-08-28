import { applyGameActions } from "./game-actions.js";
import {
  advanceDialogue,
  createDialogueRuntime,
  currentDialogueLine,
  dialogueBlocksGameInput,
  dialogueIsActive,
  startDialogue,
} from "./dialogue-runtime.js";
import {
  beginDialogueSession,
  clearDialogueVisualOverrides,
  createDialogueSessionRuntime,
  endDialogueSession,
  finishDialogueSpeakerTalking,
  markDialogueLineSpeaker,
} from "./dialogue-session.js";
import {
  cancelDialogueTalking,
  createDialogueTalkingRuntime,
  startDialogueTalking,
} from "./dialogue-timing.js";
import { calculateActorApproachRoute } from "./actor-interaction.js";
import { reconcilePatrolRuntime } from "./actor-patrol.js";
import { createCharacterMovementLoop } from "./character-movement.js";
import {
  setCharacterRoute,
} from "./character-runtime.js";
import { createGameState } from "./game-state.js";
import { createGameModel, initialSceneModel } from "./game-model.js";
import { validSelectedInventoryItem } from "./inventory-runtime.js";
import { renderInventory } from "./inventory-view.js";
import { createItemCatalog } from "./item-model.js";
import {
  calculateHotspotApproachRoute,
} from "./hotspot-interaction.js";
import {
  cancelPendingInteraction,
  capturedItemForTarget,
  createInteractionRuntime,
  resolvePendingInteraction,
  setPendingInteraction,
  takePendingInteraction,
} from "./interaction-runtime.js";
import { createSceneRenderer } from "./scene-renderer.js";
import {
  createSceneRuntimeResources,
  disposeSceneRuntimeResources,
} from "./scene-runtime.js";
import { parseYaml } from "./yaml-parser.js";
import { calculateWalkNavigation } from "./walk-navigation.js";
import {
  cancelPendingWalkArrival,
  createWalkArrivalRuntime,
  resolveWalkArrival,
  setPendingWalkArrival,
  takePendingWalkArrival,
} from "./walk-arrival-runtime.js";

const editor = document.querySelector("#yaml-editor");
const preview = document.querySelector("#scene-preview");
const errorOutput = document.querySelector("#yaml-error");
const stateView = document.querySelector("#state-view");
const stateOutput = document.querySelector("#state-output");
const inventoryItems = document.querySelector("#inventory-items");
const interactionStatus = document.querySelector("#interaction-status");
const dialogueView = document.querySelector("#dialogue-view");
const dialogueActor = document.querySelector("#dialogue-actor");
const dialogueText = document.querySelector("#dialogue-text");
const dialogueContinue = document.querySelector("#dialogue-continue");
const AUTONOMOUS_ACTOR_SPEED = 300;
let currentGameState = null;
let currentGameModel = null;
let currentSceneModel = null;
let currentUseInteraction = null;
let selectedInventoryItem = null;
let currentCharacterRuntime = null;
let currentCharacterMovement = null;
let currentActorsRuntime = {};
let currentActorMovements = new Map();
let interactionRuntime = createInteractionRuntime();
let walkArrivalRuntime = createWalkArrivalRuntime();
let dialogueRuntime = createDialogueRuntime();
let dialogueSession = createDialogueSessionRuntime();
let dialogueTalkingRuntime = createDialogueTalkingRuntime();
let sceneDeactivating = false;
const sceneRenderer = createSceneRenderer(
  preview,
  activateHotspot,
  moveCharacterTo,
  activateActor,
);

function parseEditorContent() {
  let parsedYaml;
  try {
    parsedYaml = parseYaml(editor.value);
  } catch (error) {
    showError("YAML inválido", error);
    return;
  }

  let items;
  try {
    items = createItemCatalog(parsedYaml.items);
  } catch (error) {
    showError("Catálogo inválido", error);
    return;
  }

  let gameState;
  try {
    gameState = createGameState(parsedYaml, items);
  } catch (error) {
    showError("Estado inválido", error);
    return;
  }

  let gameModel;
  try {
    gameModel = createGameModel(parsedYaml, gameState, items);
  } catch (error) {
    showError("Juego inválido", error);
    return;
  }
  loadGame(gameModel, gameState);
}

function loadGame(gameModel, gameState) {
  deactivateCurrentScene();
  currentGameModel = gameModel;
  currentGameState = gameState;
  activateScene(initialSceneModel(gameModel).sceneId);
}

function activateScene(sceneId) {
  const sceneModel = currentGameModel?.scenes.find(
    (candidate) => candidate.sceneId === sceneId,
  );
  if (sceneModel === undefined) {
    throw new Error(`No existe la escena: ${sceneId}.`);
  }
  deactivateCurrentScene();
  currentSceneModel = sceneModel;
  currentUseInteraction = sceneModel.useInteraction;
  const resources = createSceneRuntimeResources(sceneModel);
  selectedInventoryItem = resources.selectedInventoryItem;
  interactionRuntime = resources.interactionRuntime;
  walkArrivalRuntime = resources.walkArrivalRuntime;
  dialogueRuntime = resources.dialogueRuntime;
  dialogueSession = resources.dialogueSession;
  dialogueTalkingRuntime = resources.dialogueTalkingRuntime;
  currentActorsRuntime = resources.actorsRuntime;
  currentCharacterRuntime = resources.controlledActorRuntime;
  currentCharacterMovement = currentCharacterRuntime === null
    ? null
    : createCharacterMovementLoop(
      currentCharacterRuntime,
      updateRuntimeCharacter,
      completeControlledActorRoute,
    );
  currentActorMovements = resources.actorMovements;
  if (currentCharacterMovement !== null) {
    currentActorMovements.set(sceneModel.controlledActorId, currentCharacterMovement);
  }
  const autonomousActorsReady = prepareAutonomousActors();
  renderCurrentScene();
  renderDialogue();
  showCurrentState();
  showInventory();
  interactionStatus.textContent = firstAutonomousError()
    ?? "Selecciona un objeto del inventario.";
  preview.hidden = false;
  stateView.hidden = false;
  errorOutput.textContent = "";
  errorOutput.hidden = true;
  autonomousActorsReady.forEach((actorId) => {
    currentActorMovements.get(actorId)?.start();
  });
}

function deactivateCurrentScene() {
  sceneDeactivating = true;
  disposeSceneRuntimeResources({
    actorsRuntime: currentActorsRuntime,
    actorMovements: currentActorMovements,
    interactionRuntime,
    walkArrivalRuntime,
    dialogueRuntime,
    dialogueSession,
    dialogueTalkingRuntime,
  }, sceneRenderer);
  currentSceneModel = null;
  currentUseInteraction = null;
  selectedInventoryItem = null;
  currentCharacterRuntime = null;
  currentCharacterMovement = null;
  currentActorsRuntime = {};
  currentActorMovements = new Map();
  interactionRuntime = createInteractionRuntime();
  walkArrivalRuntime = createWalkArrivalRuntime();
  dialogueRuntime = createDialogueRuntime();
  dialogueSession = createDialogueSessionRuntime();
  dialogueTalkingRuntime = createDialogueTalkingRuntime();
  sceneDeactivating = false;
}

function showError(prefix, error) {
  deactivateCurrentScene();
  currentGameModel = null;
  currentGameState = null;
  renderDialogue();
  preview.hidden = true;
  stateOutput.textContent = "";
  inventoryItems.replaceChildren();
  interactionStatus.textContent = "";
  stateView.hidden = true;
  errorOutput.textContent = errorMessage(prefix, error);
  errorOutput.hidden = false;
}

function activateHotspot(hotspot) {
  if (!currentGameState || dialogueBlocksGameInput(dialogueRuntime)) {
    return;
  }
  cancelPendingWalkArrival(walkArrivalRuntime);
  const capturedItemId = capturedItemForTarget(
    "hotspot",
    hotspot.id,
    selectedInventoryItem,
    currentUseInteraction,
  );
  if (hotspot.approach !== null) {
    approachHotspot(hotspot, capturedItemId);
    return;
  }

  cancelPendingInteraction(interactionRuntime);
  if (currentCharacterRuntime !== null && currentCharacterRuntime.destination !== null) {
    currentCharacterMovement.stop();
  }

  if (
    currentUseInteraction
    && selectedInventoryItem === currentUseInteraction.itemId
    && currentUseInteraction.targetType === "hotspot"
    && hotspot.id === currentUseInteraction.targetId
  ) {
    applyEffectsAndRender(
      currentUseInteraction.effects,
      `${selectedInventoryItem} usado sobre ${hotspot.id}.`,
    );
    return;
  }

  if (hotspot.effects.length > 0) {
    applyEffectsAndRender(hotspot.effects, `Hotspot activado: ${hotspot.id}.`);
    return;
  }

  interactionStatus.textContent = selectedInventoryItem
    ? `${selectedInventoryItem} no se puede usar sobre ${hotspot.id}.`
    : `Selecciona un objeto antes de usarlo sobre ${hotspot.id}.`;
}

function activateActor(actor) {
  if (
    !currentGameState
    || dialogueBlocksGameInput(dialogueRuntime)
    || actor.id === currentSceneModel.controlledActorId
    || actor.interactions === null
  ) {
    return;
  }
  cancelPendingWalkArrival(walkArrivalRuntime);
  cancelPendingInteraction(interactionRuntime);
  const capturedItemId = capturedItemForTarget(
    "actor",
    actor.id,
    selectedInventoryItem,
    currentUseInteraction,
  );
  if (selectedInventoryItem !== null && capturedItemId === null) {
    currentCharacterMovement?.stop();
    interactionStatus.textContent = `${selectedInventoryItem} no se puede usar sobre ${actor.id}.`;
    showCurrentState();
    return;
  }
  approachActor(actor, capturedItemId);
}

function approachHotspot(hotspot, capturedItemId) {
  cancelPendingInteraction(interactionRuntime);
  cancelPendingWalkArrival(walkArrivalRuntime);
  if (currentCharacterRuntime === null || currentCharacterMovement === null) {
    interactionStatus.textContent = "No existe un personaje que pueda acercarse al hotspot.";
    showCurrentState();
    return;
  }

  try {
    const route = calculateHotspotApproachRoute(
      currentSceneModel.walk,
      currentCharacterRuntime.position,
      hotspot,
      currentGameState,
    );
    setPendingInteraction(interactionRuntime, "hotspot", hotspot.id, capturedItemId);
    setCharacterRoute(currentCharacterRuntime, route, currentSceneModel.size);
    interactionStatus.textContent = `Acercándose a ${hotspot.id}.`;
    showCurrentState();
    if (currentCharacterRuntime.destination === null) {
      updateRuntimeCharacter(
        currentCharacterRuntime.position,
        currentCharacterRuntime.facing,
        currentCharacterRuntime.motion,
      );
      completeControlledActorRoute();
    } else {
      currentCharacterMovement.start();
    }
  } catch (error) {
    currentCharacterMovement.stop();
    cancelPendingInteraction(interactionRuntime);
    interactionStatus.textContent = errorMessage("No se pudo llegar al hotspot", error);
    showCurrentState();
  }
}

function approachActor(actor, capturedItemId) {
  cancelPendingWalkArrival(walkArrivalRuntime);
  if (currentCharacterRuntime === null || currentCharacterMovement === null) {
    interactionStatus.textContent = "No existe un actor controlado que pueda acercarse.";
    showCurrentState();
    return;
  }
  const targetRuntime = currentActorsRuntime[actor.id];
  if (targetRuntime === undefined) {
    interactionStatus.textContent = `El actor ${actor.id} ya no existe.`;
    showCurrentState();
    return;
  }

  try {
    const route = calculateActorApproachRoute(
      currentSceneModel.walk,
      currentCharacterRuntime.position,
      targetRuntime.position,
      actor.interactions.approachDistance,
      currentGameState,
    );
    setPendingInteraction(interactionRuntime, "actor", actor.id, capturedItemId);
    setCharacterRoute(currentCharacterRuntime, route, currentSceneModel.size);
    interactionStatus.textContent = `Acercándose al actor ${actor.id}.`;
    showCurrentState();
    if (currentCharacterRuntime.destination === null) {
      updateRuntimeCharacter(
        currentCharacterRuntime.position,
        currentCharacterRuntime.facing,
        currentCharacterRuntime.motion,
      );
      completeControlledActorRoute();
    } else {
      currentCharacterMovement.start();
    }
  } catch (error) {
    currentCharacterMovement.stop();
    cancelPendingInteraction(interactionRuntime);
    interactionStatus.textContent = errorMessage("No se pudo llegar al actor", error);
    showCurrentState();
  }
}

function completePendingInteraction() {
  const pendingInteraction = takePendingInteraction(interactionRuntime);
  if (pendingInteraction === null) {
    showCurrentState();
    return;
  }

  try {
    const interaction = resolvePendingInteraction(
      pendingInteraction,
      currentSceneModel,
      currentUseInteraction,
      currentGameState,
      currentActorsRuntime,
    );
    if (interaction.effects.length === 0) {
      interactionStatus.textContent = interaction.successMessage;
      showCurrentState();
      return;
    }
    applyEffectsAndRender(interaction.effects, interaction.successMessage);
  } catch (error) {
    interactionStatus.textContent = errorMessage("No se ejecutó la interacción", error);
    showCurrentState();
  }
}

function completeControlledActorRoute() {
  if (interactionRuntime.pendingInteraction !== null) {
    cancelPendingWalkArrival(walkArrivalRuntime);
    completePendingInteraction();
    return;
  }
  const pending = takePendingWalkArrival(walkArrivalRuntime);
  if (pending === null) {
    showCurrentState();
    return;
  }
  try {
    const arrival = resolveWalkArrival(
      pending,
      currentSceneModel.walk,
      currentGameState,
    );
    if (arrival.actions.length === 0) {
      showCurrentState();
      return;
    }
    applyEffectsAndRender(
      arrival.actions,
      `Llegada al nodo: ${arrival.nodeId}.`,
    );
  } catch (error) {
    interactionStatus.textContent = errorMessage("No se ejecutó la llegada", error);
    showCurrentState();
  }
}

function applyEffectsAndRender(effects, successMessage) {
  const sourceScene = currentSceneModel;
  try {
    executeGameActions(effects);
    if (currentSceneModel !== sourceScene) {
      return;
    }
    reconcileAutonomousActors();
    renderCurrentScene();
    renderDialogue();
    showCurrentState();
    showInventory();
    interactionStatus.textContent = successMessage;
  } catch (error) {
    if (currentSceneModel !== sourceScene) {
      interactionStatus.textContent = errorMessage("No se ejecutaron las acciones", error);
      return;
    }
    reconcileAutonomousActors();
    renderCurrentScene();
    renderDialogue();
    showCurrentState();
    showInventory();
    interactionStatus.textContent = errorMessage("No se ejecutaron las acciones", error);
  }
}

function showCurrentState() {
  const actors = Object.fromEntries(currentSceneModel?.actors.map((actor) => {
    const runtime = currentActorsRuntime[actor.id];
    return [actor.id, {
      position: { ...runtime.position },
      facing: runtime.facing,
      motion: runtime.motion,
      visualStateOverride: runtime.visualStateOverride,
      route: runtime.route.map((point) => ({ ...point })),
      autonomousMovement: runtime.autonomousMovement === null
        ? null
        : { ...runtime.autonomousMovement },
    }];
  }) ?? []);
  const currentDialogue = dialogueRuntime.currentDialogue === null
    ? null
    : { ...dialogueRuntime.currentDialogue };
  const gameContext = {
    gameId: currentGameModel?.id ?? null,
    currentSceneId: currentSceneModel?.sceneId ?? null,
  };
  const developmentState = currentCharacterRuntime === null
    ? { ...gameContext, ...currentGameState, currentDialogue }
    : {
      ...gameContext,
      ...currentGameState,
      actors,
      controlledActor: currentSceneModel.controlledActorId,
      pendingInteraction: interactionRuntime.pendingInteraction === null
        ? null
        : { ...interactionRuntime.pendingInteraction },
      pendingWalkArrival: walkArrivalRuntime.pendingWalkArrival === null
        ? null
        : { ...walkArrivalRuntime.pendingWalkArrival },
      currentDialogue,
      dialogueSession: dialogueSession.participantIds.length === 0
        ? null
        : {
          participantIds: [...dialogueSession.participantIds],
          speakerId: dialogueSession.speakerId,
          talking: dialogueTalkingRuntime.talking,
        },
    };
  stateOutput.textContent = JSON.stringify(developmentState, null, 2);
}

function renderCurrentScene() {
  sceneRenderer.render(
    currentSceneModel,
    currentGameState,
    currentActorsRuntime,
  );
}

function moveCharacterTo(destination) {
  if (dialogueBlocksGameInput(dialogueRuntime)) {
    return;
  }
  cancelPendingInteraction(interactionRuntime);
  cancelPendingWalkArrival(walkArrivalRuntime);
  if (
    currentCharacterRuntime === null
    || currentCharacterMovement === null
    || currentSceneModel.walk === null
  ) {
    showCurrentState();
    return;
  }
  try {
    const navigation = calculateWalkNavigation(
      currentSceneModel.walk,
      currentCharacterRuntime.position,
      destination,
      currentGameState,
    );
    setPendingWalkArrival(walkArrivalRuntime, navigation.arrivalNodeId);
    setCharacterRoute(currentCharacterRuntime, navigation.route, currentSceneModel.size);
    if (currentCharacterRuntime.destination === null) {
      updateRuntimeCharacter(
        currentCharacterRuntime.position,
        currentCharacterRuntime.facing,
        currentCharacterRuntime.motion,
      );
      completeControlledActorRoute();
    } else {
      currentCharacterMovement.start();
    }
    showCurrentState();
  } catch (error) {
    currentCharacterMovement.stop();
    cancelPendingWalkArrival(walkArrivalRuntime);
    interactionStatus.textContent = errorMessage("Ruta inválida", error);
    showCurrentState();
  }
}

function updateRuntimeCharacter(position, facing, motion) {
  updateRuntimeActor(
    currentSceneModel.controlledActorId,
    position,
    facing,
    motion,
  );
}

function updateRuntimeActor(actorId, position, facing, motion) {
  if (sceneDeactivating) {
    return;
  }
  sceneRenderer.updateActor(
    actorId,
    position,
    facing,
    motion,
  );
  showCurrentState();
}

function executeGameActions(actions) {
  try {
    applyGameActions(currentGameState, actions, {
      startDialogue: beginDialogue,
      changeScene: activateScene,
    });
  } finally {
    selectedInventoryItem = validSelectedInventoryItem(
      selectedInventoryItem,
      currentGameState.inventory,
    );
  }
}

function prepareAutonomousActors() {
  const ready = [];
  currentSceneModel.actors.forEach((actor) => {
    if (actor.id === currentSceneModel.controlledActorId || actor.movement === null) {
      return;
    }
    const runtime = currentActorsRuntime[actor.id];
    const movement = createCharacterMovementLoop(
      runtime,
      (position, facing, motion) => updateRuntimeActor(
        actor.id,
        position,
        facing,
        motion,
      ),
      () => continueAutonomousActor(actor.id),
      undefined,
      AUTONOMOUS_ACTOR_SPEED,
    );
    currentActorMovements.set(actor.id, movement);
    if (reconcilePatrolRuntime(
      actor,
      runtime,
      currentGameState,
      currentSceneModel.walk,
      currentSceneModel.size,
    ) === "start") {
      ready.push(actor.id);
    }
  });
  return ready;
}

function continueAutonomousActor(actorId) {
  const actor = currentSceneModel.actors.find((candidate) => candidate.id === actorId);
  const runtime = currentActorsRuntime[actorId];
  if (actor === undefined || runtime === undefined) {
    return;
  }
  const action = reconcilePatrolRuntime(
    actor,
    runtime,
    currentGameState,
    currentSceneModel.walk,
    currentSceneModel.size,
  );
  updateRuntimeActor(actorId, runtime.position, runtime.facing, runtime.motion);
  if (action === "start") {
    currentActorMovements.get(actorId)?.start();
  } else if (runtime.autonomousMovement.error !== null) {
    interactionStatus.textContent = runtime.autonomousMovement.error;
  }
}

function reconcileAutonomousActors() {
  currentSceneModel.actors.forEach((actor) => {
    if (
      actor.id === currentSceneModel.controlledActorId
      || actor.movement === null
      || dialogueSession.participantIds.includes(actor.id)
    ) {
      return;
    }
    const runtime = currentActorsRuntime[actor.id];
    const action = reconcilePatrolRuntime(
      actor,
      runtime,
      currentGameState,
      currentSceneModel.walk,
      currentSceneModel.size,
    );
    if (action === "stop") {
      currentActorMovements.get(actor.id)?.stop();
    } else if (action === "start") {
      currentActorMovements.get(actor.id)?.start();
    }
  });
}

function firstAutonomousError() {
  return Object.values(currentActorsRuntime)
    .map((runtime) => runtime.autonomousMovement?.error)
    .find((error) => error !== null && error !== undefined) ?? null;
}

function showInventory() {
  renderInventory(
    inventoryItems,
    currentGameState.inventory,
    selectedInventoryItem,
    (itemId) => {
      selectedInventoryItem = itemId;
      showInventory();
      interactionStatus.textContent = `Objeto seleccionado: ${itemId}`;
    },
  );
}

function renderDialogue() {
  const line = currentDialogueLine(
    dialogueRuntime,
    currentSceneModel?.dialogues ?? [],
  );
  if (line === null) {
    dialogueView.hidden = true;
    dialogueActor.textContent = "";
    dialogueText.textContent = "";
    return;
  }
  dialogueActor.textContent = line.actorId;
  dialogueText.textContent = line.text;
  dialogueView.hidden = false;
}

function continueDialogue() {
  if (!dialogueIsActive(dialogueRuntime)) {
    return;
  }
  cancelDialogueTalking(dialogueTalkingRuntime);
  const nextLine = advanceDialogue(dialogueRuntime, currentSceneModel.dialogues);
  if (nextLine === null) {
    clearDialogueVisualOverrides(
      dialogueSession,
      currentActorsRuntime,
      updateDialogueActorVisual,
    );
    endDialogueSession(dialogueSession, resumeDialogueParticipant);
  } else {
    startDialogueLineTalking(nextLine);
  }
  renderDialogue();
  showCurrentState();
  interactionStatus.textContent = nextLine === null
    ? firstAutonomousError() ?? "Diálogo terminado."
    : `Diálogo: ${dialogueRuntime.currentDialogue.dialogueId}.`;
}

function beginDialogue(dialogueId) {
  const dialogue = currentSceneModel.dialogues.find(
    (candidate) => candidate.id === dialogueId,
  );
  const firstLine = startDialogue(
    dialogueRuntime,
    dialogueId,
    currentSceneModel.dialogues,
  );
  cancelPendingWalkArrival(walkArrivalRuntime);
  try {
    beginDialogueSession(
      dialogueSession,
      dialogue,
      currentActorsRuntime,
      currentActorMovements,
      (actorId, runtime) => updateRuntimeActor(
        actorId,
        runtime.position,
        runtime.facing,
        runtime.motion,
      ),
    );
    startDialogueLineTalking(firstLine);
  } catch (error) {
    cancelDialogueTalking(dialogueTalkingRuntime);
    clearDialogueVisualOverrides(
      dialogueSession,
      currentActorsRuntime,
      updateDialogueActorVisual,
    );
    endDialogueSession(dialogueSession, resumeDialogueParticipant);
    dialogueRuntime.currentDialogue = null;
    throw error;
  }
  cancelPendingInteraction(interactionRuntime);
}

function startDialogueLineTalking(line) {
  markDialogueLineSpeaker(
    dialogueSession,
    line.actorId,
    currentActorsRuntime,
    updateDialogueActorVisual,
  );
  startDialogueTalking(
    dialogueTalkingRuntime,
    line.actorId,
    line.text,
    (speakerId) => {
      finishDialogueSpeakerTalking(
        dialogueSession,
        speakerId,
        currentActorsRuntime,
        updateDialogueActorVisual,
      );
      showCurrentState();
    },
  );
}

function updateDialogueActorVisual(actorId, runtime) {
  updateRuntimeActor(
    actorId,
    runtime.position,
    runtime.facing,
    runtime.motion,
  );
}

function resumeDialogueParticipant(actorId) {
  if (actorId === currentSceneModel.controlledActorId) {
    return;
  }
  const actor = currentSceneModel.actors.find((candidate) => candidate.id === actorId);
  const runtime = currentActorsRuntime[actorId];
  if (actor?.movement === null || actor === undefined || runtime === undefined) {
    return;
  }
  if (runtime.autonomousMovement?.error !== null) {
    updateRuntimeActor(actorId, runtime.position, runtime.facing, runtime.motion);
    return;
  }
  const action = reconcilePatrolRuntime(
    actor,
    runtime,
    currentGameState,
    currentSceneModel.walk,
    currentSceneModel.size,
  );
  updateRuntimeActor(actorId, runtime.position, runtime.facing, runtime.motion);
  if (action === "start") {
    currentActorMovements.get(actorId)?.start();
  }
}

function errorMessage(prefix, error) {
  if (error instanceof Error && error.message) {
    return `${prefix}: ${error.message}`;
  }
  return `${prefix}: no se pudo interpretar el contenido.`;
}

editor.addEventListener("input", parseEditorContent);
dialogueContinue.addEventListener("click", continueDialogue);
parseEditorContent();
