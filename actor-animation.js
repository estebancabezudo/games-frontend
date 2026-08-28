export function createActorAnimationRuntime() {
  return {
    frameIndex: 0,
    elapsed: 0,
    representation: null,
    selection: null,
  };
}

export function selectActorAnimation(
  runtime,
  representation,
  visualState,
  facing,
  visualStateRevision = 0,
) {
  const selection = visualStateRevision === 0
    ? `${visualState}:${facing}`
    : `${visualState}:${facing}:${visualStateRevision}`;
  if (runtime.selection === selection && runtime.representation === representation) {
    return false;
  }
  runtime.frameIndex = 0;
  runtime.elapsed = 0;
  runtime.representation = representation;
  runtime.selection = selection;
  return true;
}

export function advanceActorAnimation(runtime, elapsedSeconds) {
  const representation = runtime.representation;
  if (representation?.type !== "animation" || elapsedSeconds <= 0) {
    return false;
  }
  if (!representation.loop && runtime.frameIndex === representation.frames.length - 1) {
    return false;
  }

  runtime.elapsed += elapsedSeconds;
  const framesToAdvance = Math.floor(runtime.elapsed * representation.fps);
  if (framesToAdvance === 0) {
    return false;
  }
  runtime.elapsed -= framesToAdvance / representation.fps;
  const previousFrame = runtime.frameIndex;
  runtime.frameIndex = representation.loop
    ? (runtime.frameIndex + framesToAdvance) % representation.frames.length
    : Math.min(
      representation.frames.length - 1,
      runtime.frameIndex + framesToAdvance,
    );
  if (!representation.loop && runtime.frameIndex === representation.frames.length - 1) {
    runtime.elapsed = 0;
  }
  return runtime.frameIndex !== previousFrame;
}

export function currentActorAnimationAsset(runtime) {
  if (runtime.representation === null) {
    return null;
  }
  return runtime.representation.type === "asset"
    ? runtime.representation.asset
    : runtime.representation.frames[runtime.frameIndex];
}

export function actorAnimationIsActive(runtime) {
  const representation = runtime.representation;
  return representation?.type === "animation" && (
    representation.loop
    || runtime.frameIndex < representation.frames.length - 1
  );
}
