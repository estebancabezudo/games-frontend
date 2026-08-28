import {
  advanceCharacterRoute,
  constrainCharacterRuntimePosition,
} from "./character-runtime.js";
import { actorFacingFromMovement } from "./actor-facing.js";

const CHARACTER_SPEED = 600;

export function moveToward(currentPosition, destination, distance) {
  const deltaX = destination.x - currentPosition.x;
  const deltaY = destination.y - currentPosition.y;
  const remainingDistance = Math.hypot(deltaX, deltaY);
  if (remainingDistance === 0 || distance >= remainingDistance) {
    return {
      position: { ...destination },
      arrived: true,
    };
  }

  const progress = distance / remainingDistance;
  return {
    position: {
      x: currentPosition.x + deltaX * progress,
      y: currentPosition.y + deltaY * progress,
    },
    arrived: false,
  };
}

export function advanceCharacterRuntime(runtime, elapsedSeconds, speed = CHARACTER_SPEED) {
  if (runtime.destination === null) {
    return false;
  }

  let remainingDistance = speed * elapsedSeconds;
  while (runtime.destination !== null) {
    const distanceToDestination = Math.hypot(
      runtime.destination.x - runtime.position.x,
      runtime.destination.y - runtime.position.y,
    );
    const movement = moveToward(
      runtime.position,
      runtime.destination,
      remainingDistance,
    );
    const nextPosition = constrainCharacterRuntimePosition(runtime, movement.position);
    runtime.facing = actorFacingFromMovement(
      nextPosition.x - runtime.position.x,
      nextPosition.y - runtime.position.y,
      runtime.facingDirections,
      runtime.facing,
    );
    runtime.position = nextPosition;
    if (!movement.arrived) {
      break;
    }
    remainingDistance = Math.max(0, remainingDistance - distanceToDestination);
    advanceCharacterRoute(runtime);
    if (remainingDistance === 0) {
      break;
    }
  }
  return true;
}

export function createCharacterMovementLoop(
  runtime,
  onPositionChange,
  onRouteComplete = () => {},
  animationFrame = defaultAnimationFrame(),
  speed = CHARACTER_SPEED,
) {
  let frameRequest = null;
  let previousTimestamp = null;

  return {
    start() {
      if (frameRequest === null && runtime.destination !== null) {
        runtime.motion = "walking";
        onPositionChange(runtime.position, runtime.facing, runtime.motion);
        previousTimestamp = null;
        frameRequest = animationFrame.request(update);
      }
    },
    stop() {
      if (frameRequest !== null) {
        animationFrame.cancel(frameRequest);
      }
      frameRequest = null;
      previousTimestamp = null;
      runtime.destination = null;
      runtime.route = [];
      runtime.motion = "idle";
      onPositionChange(runtime.position, runtime.facing, runtime.motion);
    },
  };

  function update(timestamp) {
    frameRequest = null;
    if (runtime.destination === null) {
      previousTimestamp = null;
      return;
    }
    if (previousTimestamp === null) {
      previousTimestamp = timestamp;
    } else {
      const elapsedSeconds = Math.max(0, timestamp - previousTimestamp) / 1000;
      previousTimestamp = timestamp;
      advanceCharacterRuntime(runtime, elapsedSeconds, speed);
      onPositionChange(runtime.position, runtime.facing, runtime.motion);
    }

    if (runtime.destination !== null) {
      frameRequest = animationFrame.request(update);
    } else {
      previousTimestamp = null;
      onRouteComplete();
    }
  }
}

function defaultAnimationFrame() {
  return {
    request: (callback) => requestAnimationFrame(callback),
    cancel: (request) => cancelAnimationFrame(request),
  };
}
