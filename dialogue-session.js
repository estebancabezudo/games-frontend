import { actorFacingFromMovement } from "./actor-facing.js";

export function createDialogueSessionRuntime() {
  return { participantIds: [], speakerId: null };
}

export function dialogueSessionIsActive(runtime) {
  return runtime.participantIds.length > 0;
}

export function beginDialogueSession(
  sessionRuntime,
  dialogue,
  actorsRuntime,
  actorMovements,
  onActorUpdated = () => {},
) {
  if (dialogueSessionIsActive(sessionRuntime)) {
    throw new Error("Ya existe una sesión física de diálogo activa.");
  }
  const participants = dialogue.participantIds.map((actorId) => {
    const actorRuntime = actorsRuntime[actorId];
    if (actorRuntime === undefined) {
      throw new Error(`No existe el runtime del participante ${actorId}.`);
    }
    return { actorId, actorRuntime };
  });

  sessionRuntime.participantIds = [...dialogue.participantIds];
  sessionRuntime.speakerId = null;
  participants.forEach(({ actorId, actorRuntime }) => {
    const movement = actorMovements.get(actorId);
    if (movement === undefined) {
      actorRuntime.destination = null;
      actorRuntime.route = [];
      actorRuntime.motion = "idle";
    } else {
      movement.stop();
    }
  });
  if (participants.length === 2) {
    orientParticipantToward(participants[0].actorRuntime, participants[1].actorRuntime);
    orientParticipantToward(participants[1].actorRuntime, participants[0].actorRuntime);
  }
  participants.forEach(({ actorId, actorRuntime }) => {
    onActorUpdated(actorId, actorRuntime);
  });
  return [...sessionRuntime.participantIds];
}

export function endDialogueSession(sessionRuntime, onParticipantReleased = () => {}) {
  const participantIds = [...sessionRuntime.participantIds];
  sessionRuntime.participantIds = [];
  sessionRuntime.speakerId = null;
  participantIds.forEach(onParticipantReleased);
  return participantIds;
}

export function markDialogueSpeaker(
  sessionRuntime,
  speakerId,
  actorsRuntime,
  onActorUpdated = () => {},
) {
  if (!sessionRuntime.participantIds.includes(speakerId)) {
    throw new Error(`El hablante no participa en el diálogo: ${speakerId}.`);
  }
  if (actorsRuntime[speakerId] === undefined) {
    throw new Error(`No existe el runtime del hablante ${speakerId}.`);
  }
  if (sessionRuntime.speakerId === speakerId) {
    return false;
  }
  sessionRuntime.participantIds.forEach((actorId) => {
    const actorRuntime = actorsRuntime[actorId];
    const visualStateOverride = actorId === speakerId ? "talking" : null;
    if (actorRuntime.visualStateOverride !== visualStateOverride) {
      actorRuntime.visualStateOverride = visualStateOverride;
      onActorUpdated(actorId, actorRuntime);
    }
  });
  sessionRuntime.speakerId = speakerId;
  return true;
}

export function markDialogueLineSpeaker(
  sessionRuntime,
  speakerId,
  actorsRuntime,
  onActorUpdated = () => {},
) {
  requireSessionSpeaker(sessionRuntime, speakerId, actorsRuntime);
  sessionRuntime.participantIds.forEach((actorId) => {
    const actorRuntime = actorsRuntime[actorId];
    const visualStateOverride = actorId === speakerId ? "talking" : null;
    const startsNewPhrase = actorId === speakerId;
    if (startsNewPhrase) {
      actorRuntime.visualStateRevision = (actorRuntime.visualStateRevision ?? 0) + 1;
    }
    if (actorRuntime.visualStateOverride !== visualStateOverride || startsNewPhrase) {
      actorRuntime.visualStateOverride = visualStateOverride;
      onActorUpdated(actorId, actorRuntime);
    }
  });
  sessionRuntime.speakerId = speakerId;
  return true;
}

export function finishDialogueSpeakerTalking(
  sessionRuntime,
  speakerId,
  actorsRuntime,
  onActorUpdated = () => {},
) {
  if (sessionRuntime.speakerId !== speakerId) {
    return false;
  }
  const actorRuntime = actorsRuntime[speakerId];
  if (actorRuntime === undefined || actorRuntime.visualStateOverride !== "talking") {
    return false;
  }
  actorRuntime.visualStateOverride = null;
  onActorUpdated(speakerId, actorRuntime);
  return true;
}

export function clearDialogueVisualOverrides(
  sessionRuntime,
  actorsRuntime,
  onActorUpdated = () => {},
) {
  sessionRuntime.participantIds.forEach((actorId) => {
    const actorRuntime = actorsRuntime[actorId];
    if (actorRuntime !== undefined && actorRuntime.visualStateOverride !== null) {
      actorRuntime.visualStateOverride = null;
      onActorUpdated(actorId, actorRuntime);
    }
  });
  sessionRuntime.speakerId = null;
}

function orientParticipantToward(actorRuntime, targetRuntime) {
  actorRuntime.facing = actorFacingFromMovement(
    targetRuntime.position.x - actorRuntime.position.x,
    targetRuntime.position.y - actorRuntime.position.y,
    actorRuntime.facingDirections,
    actorRuntime.facing,
  );
}

function requireSessionSpeaker(sessionRuntime, speakerId, actorsRuntime) {
  if (!sessionRuntime.participantIds.includes(speakerId)) {
    throw new Error(`El hablante no participa en el diálogo: ${speakerId}.`);
  }
  if (actorsRuntime[speakerId] === undefined) {
    throw new Error(`No existe el runtime del hablante ${speakerId}.`);
  }
}
