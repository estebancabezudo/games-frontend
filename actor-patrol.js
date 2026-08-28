import { matchesFlagCondition } from "./flag-condition.js";
import { setCharacterRoute } from "./character-runtime.js";
import { calculateWalkRoute } from "./walk-navigation.js";

export function createAutonomousMovementRuntime(movement) {
  return movement === null
    ? null
    : {
      type: "patrol",
      nextPointIndex: 0,
      error: null,
    };
}

export function requestNextPatrolRoute(
  actor,
  actorRuntime,
  walkModel,
  sceneSize,
  gameState,
) {
  const patrolRuntime = actorRuntime.autonomousMovement;
  if (actor.movement === null || patrolRuntime === null) {
    return false;
  }

  try {
    if (walkModel === null) {
      throw new Error("requiere una red walk.");
    }
    patrolRuntime.error = null;
    for (let attempt = 0; attempt < actor.movement.points.length; attempt += 1) {
      const pointIndex = patrolRuntime.nextPointIndex;
      const route = calculateWalkRoute(
        walkModel,
        actorRuntime.position,
        actor.movement.points[pointIndex],
        gameState,
      );
      setCharacterRoute(actorRuntime, route, sceneSize);
      if (actorRuntime.destination !== null) {
        return true;
      }
      patrolRuntime.nextPointIndex = (pointIndex + 1) % actor.movement.points.length;
    }
    throw new Error("no contiene un destino distinto de su posición actual.");
  } catch (error) {
    setCharacterRoute(actorRuntime, [], sceneSize);
    patrolRuntime.error = patrolError(actor.id, error);
    return false;
  }
}

export function patrolIsEnabled(actor, gameState) {
  return actor.movement !== null && (
    actor.movement.enabledWhen === null
    || actor.movement.enabledWhen === undefined
    || matchesFlagCondition(actor.movement.enabledWhen, gameState)
  );
}

export function reconcilePatrolRuntime(
  actor,
  actorRuntime,
  gameState,
  walkModel,
  sceneSize,
) {
  const patrolRuntime = actorRuntime.autonomousMovement;
  if (actor.movement === null || patrolRuntime === null) {
    return "none";
  }
  if (!patrolIsEnabled(actor, gameState)) {
    const wasActive = actorRuntime.destination !== null || actorRuntime.motion === "walking";
    setCharacterRoute(actorRuntime, [], sceneSize);
    patrolRuntime.error = null;
    return wasActive ? "stop" : "none";
  }
  if (actorRuntime.destination !== null) {
    return "none";
  }
  return requestNextPatrolRoute(actor, actorRuntime, walkModel, sceneSize, gameState)
    ? "start"
    : "none";
}

function patrolError(actorId, error) {
  const detail = error instanceof Error && error.message
    ? error.message
    : "no se pudo calcular la ruta.";
  return `Patrol del actor ${actorId}: ${detail}`;
}
