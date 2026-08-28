import { matchesFlagCondition } from "./flag-condition.js";

export function createWalkArrivalRuntime() {
  return { pendingWalkArrival: null };
}

export function setPendingWalkArrival(runtime, nodeId) {
  runtime.pendingWalkArrival = nodeId === null ? null : { nodeId };
  return runtime.pendingWalkArrival;
}

export function cancelPendingWalkArrival(runtime) {
  runtime.pendingWalkArrival = null;
}

export function takePendingWalkArrival(runtime) {
  const pending = runtime.pendingWalkArrival;
  runtime.pendingWalkArrival = null;
  return pending;
}

export function resolveWalkArrival(pending, walkModel, gameState) {
  const node = walkModel?.nodes.find((candidate) => candidate.id === pending.nodeId);
  if (node === undefined) {
    throw new Error(`El nodo de llegada ${pending.nodeId} ya no existe.`);
  }
  if (node.onArrival === null) {
    return { nodeId: node.id, actions: [] };
  }
  if (
    node.onArrival.enabledWhen !== null
    && !matchesFlagCondition(node.onArrival.enabledWhen, gameState)
  ) {
    return { nodeId: node.id, actions: [] };
  }
  return { nodeId: node.id, actions: node.onArrival.actions };
}
