import { constrainCharacterPosition } from "./character-bounds.js";
import {
  actorFacingIsSupported,
  initialActorFacing,
} from "./actor-facing.js";

export function createCharacterRuntime(character, sceneSize, depthScale) {
  if (character === null) {
    return null;
  }
  const bounds = sceneSize === undefined
    ? null
    : { character, sceneSize, depthScale };
  return {
    position: bounds === null
      ? { ...character.position }
      : constrainWithBounds(bounds, character.position),
    destination: null,
    route: [],
    facing: initialActorFacing(character.visual?.directions ?? 1),
    facingDirections: character.visual?.directions ?? 1,
    motion: "idle",
    visualStateOverride: null,
    visualStateRevision: 0,
    bounds,
  };
}

export function setCharacterDestination(runtime, destination, sceneSize) {
  setCharacterRoute(runtime, [destination], sceneSize);
}

export function setCharacterRoute(runtime, points, sceneSize) {
  const constrainedPoints = points.map((point) => (
    runtime.bounds === null
      ? {
        x: clamp(point.x, 0, sceneSize.width),
        y: clamp(point.y, 0, sceneSize.height),
      }
      : constrainWithBounds(runtime.bounds, point)
  ));
  runtime.route = removeInitialAndConsecutiveDuplicates(
    runtime.position,
    constrainedPoints,
  );
  runtime.destination = runtime.route[0] ?? null;
  runtime.motion = runtime.destination === null ? "idle" : "walking";
}

export function advanceCharacterRoute(runtime) {
  if (runtime.route.length > 0) {
    runtime.route.shift();
  }
  runtime.destination = runtime.route[0] ?? null;
  runtime.motion = runtime.destination === null ? "idle" : "walking";
}

export function setCharacterFacing(runtime, facing) {
  if (!actorFacingIsSupported(facing, runtime.facingDirections)) {
    throw new Error(
      `El facing ${facing} no es compatible con ${runtime.facingDirections} direcciones.`,
    );
  }
  runtime.facing = facing;
  runtime.motion = "idle";
  return runtime.facing;
}

export function constrainCharacterRuntimePosition(runtime, position) {
  return runtime.bounds === null
    ? position
    : constrainWithBounds(runtime.bounds, position);
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function constrainWithBounds(bounds, position) {
  return constrainCharacterPosition(
    bounds.character,
    bounds.depthScale,
    bounds.sceneSize,
    position,
  );
}

function removeInitialAndConsecutiveDuplicates(position, points) {
  const route = [];
  let previous = position;
  points.forEach((point) => {
    if (Math.hypot(point.x - previous.x, point.y - previous.y) > 0.000001) {
      route.push(point);
      previous = point;
    }
  });
  return route;
}
