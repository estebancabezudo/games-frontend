import { createFlagCondition, matchesFlagCondition } from "./flag-condition.js";
import { createGameActions } from "./game-actions.js";

export function createWalkModel(
  value,
  gameState = { flags: {} },
  dialogues = [],
  items = [],
  sceneIds = null,
) {
  if (value === undefined) {
    return null;
  }
  const definition = requiredObject(value, "walk");
  const nodes = walkNodes(definition.nodes, gameState, dialogues, items, sceneIds);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const paths = walkPaths(definition.paths, nodeById, gameState);
  const segments = paths.map((path) => {
    const start = nodeById.get(path.from);
    const end = nodeById.get(path.to);
    return {
      from: path.from,
      to: path.to,
      start: { x: start.x, y: start.y },
      end: { x: end.x, y: end.y },
      length: Math.hypot(end.x - start.x, end.y - start.y),
      enabledWhen: path.enabledWhen,
    };
  });

  return { nodes, paths, segments };
}

function walkNodes(value, gameState, dialogues, items, sceneIds) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("walk.nodes debe ser una lista no vacía.");
  }
  const ids = new Set();
  return value.map((node, index) => {
    const path = `walk.nodes[${index}]`;
    const definition = requiredObject(node, path);
    const id = requiredText(definition.id, `${path}.id`);
    if (ids.has(id)) {
      throw new Error(`walk.nodes contiene un id duplicado: ${id}.`);
    }
    ids.add(id);
    return {
      id,
      x: requiredCoordinate(definition.x, `${path}.x`),
      y: requiredCoordinate(definition.y, `${path}.y`),
      onArrival: definition.on_arrival === undefined
        ? null
        : walkNodeArrival(
          definition.on_arrival,
          gameState,
          dialogues,
          items,
          `${path}.on_arrival`,
          sceneIds,
        ),
    };
  });
}

function walkNodeArrival(value, gameState, dialogues, items, path, sceneIds) {
  const definition = requiredObject(value, path);
  return {
    enabledWhen: definition.enabled_when === undefined
      ? null
      : createFlagCondition(definition.enabled_when, gameState, `${path}.enabled_when`),
    actions: createGameActions(
      definition.effects,
      gameState,
      dialogues,
      `${path}.effects`,
      items,
      { allowChangeScene: true, sceneIds },
    ),
  };
}

function walkPaths(value, nodeById, gameState) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("walk.paths debe ser una lista no vacía.");
  }
  const connections = new Set();
  return value.map((path, index) => {
    const modelPath = `walk.paths[${index}]`;
    const definition = requiredObject(path, modelPath);
    const from = requiredText(definition.from, `${modelPath}.from`);
    const to = requiredText(definition.to, `${modelPath}.to`);
    if (!nodeById.has(from)) {
      throw new Error(`${modelPath}.from refiere a un nodo inexistente: ${from}.`);
    }
    if (!nodeById.has(to)) {
      throw new Error(`${modelPath}.to refiere a un nodo inexistente: ${to}.`);
    }
    if (from === to) {
      throw new Error(`${modelPath} debe conectar dos nodos diferentes.`);
    }
    const connectionKey = [from, to].sort().join("\u0000");
    if (connections.has(connectionKey)) {
      throw new Error(`${modelPath} duplica la conexión entre ${from} y ${to}.`);
    }
    connections.add(connectionKey);
    return {
      from,
      to,
      enabledWhen: definition.enabled_when === undefined
        ? null
        : createFlagCondition(
          definition.enabled_when,
          gameState,
          `${modelPath}.enabled_when`,
        ),
    };
  });
}

export function walkSegmentIsEnabled(segment, gameState) {
  return segment.enabledWhen === null
    || segment.enabledWhen === undefined
    || matchesFlagCondition(segment.enabledWhen, gameState);
}

export function resolveActiveWalkGraph(walkModel, gameState) {
  const activeSegments = walkModel.segments.filter(
    (segment) => walkSegmentIsEnabled(segment, gameState),
  );
  const activeConnections = new Set(activeSegments.map(
    (segment) => [segment.from, segment.to].sort().join("\u0000"),
  ));
  return {
    nodes: walkModel.nodes,
    paths: walkModel.paths.filter((path) => activeConnections.has(
      [path.from, path.to].sort().join("\u0000"),
    )),
    segments: activeSegments,
  };
}

function requiredObject(value, path) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} debe ser un objeto.`);
  }
  return value;
}

function requiredText(value, path) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${path} debe ser un texto no vacío.`);
  }
  return value.trim();
}

function requiredCoordinate(value, path) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${path} debe ser un número mayor o igual que cero.`);
  }
  return value;
}
