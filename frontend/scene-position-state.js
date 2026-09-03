export function createScenePositionState() {
  return {
    positionsByScene: new Map(),
  };
}

export function saveSceneActorPositions(positionState, sceneId, actorsRuntime) {
  const positions = new Map();
  Object.entries(actorsRuntime).forEach(([actorId, runtime]) => {
    positions.set(actorId, {
      x: runtime.position.x,
      y: runtime.position.y,
    });
  });
  positionState.positionsByScene.set(sceneId, positions);
}

export function restoreSceneActorPositions(positionState, sceneId, actorsRuntime) {
  const positions = positionState.positionsByScene.get(sceneId);
  if (positions === undefined) {
    return;
  }
  Object.entries(actorsRuntime).forEach(([actorId, runtime]) => {
    const position = positions.get(actorId);
    if (position !== undefined) {
      runtime.position = {
        x: position.x,
        y: position.y,
      };
    }
  });
}

export function clearScenePositionState(positionState) {
  positionState.positionsByScene.clear();
}

export function copyScenePositionSnapshots(positionState) {
  return new Map([...positionState.positionsByScene].map(([sceneId, positions]) => [
    sceneId,
    new Map([...positions].map(([actorId, position]) => [
      actorId,
      { x: position.x, y: position.y },
    ])),
  ]));
}

export function setScenePositionSnapshot(positionState, sceneId, positions) {
  positionState.positionsByScene.set(
    sceneId,
    new Map(Object.entries(positions).map(([actorId, position]) => [
      actorId,
      { x: position.x, y: position.y },
    ])),
  );
}
