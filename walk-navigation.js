import { resolveActiveWalkGraph } from "./walk-model.js";

const START_ID = "@walk-start";
const DESTINATION_ID = "@walk-destination";
const POSITION_EPSILON = 0.000001;

export function projectPointToSegment(point, segment) {
  const deltaX = segment.end.x - segment.start.x;
  const deltaY = segment.end.y - segment.start.y;
  const squaredLength = deltaX ** 2 + deltaY ** 2;
  const rawProgress = squaredLength === 0
    ? 0
    : ((point.x - segment.start.x) * deltaX
      + (point.y - segment.start.y) * deltaY) / squaredLength;
  const progress = Math.min(1, Math.max(0, rawProgress));
  const projectedPoint = {
    x: segment.start.x + deltaX * progress,
    y: segment.start.y + deltaY * progress,
  };
  return {
    point: projectedPoint,
    segment,
    distance: Math.hypot(point.x - projectedPoint.x, point.y - projectedPoint.y),
    progress,
  };
}

export function projectPointToWalkGraph(point, walkModel, gameState) {
  const graph = activeGraphForNavigation(walkModel, gameState);
  const projection = graph.segments.reduce((nearest, segment) => {
    const projection = projectPointToSegment(point, segment);
    return nearest === null || projection.distance < nearest.distance
      ? projection
      : nearest;
  }, null);
  if (projection === null) {
    throw new Error("No existen paths walk habilitados.");
  }
  return projection;
}

export function calculateWalkRoute(walkModel, origin, requestedDestination, gameState) {
  return calculateWalkNavigation(
    walkModel,
    origin,
    requestedDestination,
    gameState,
  ).route;
}

export function calculateWalkNavigation(
  walkModel,
  origin,
  requestedDestination,
  gameState,
) {
  const activeGraph = activeGraphForNavigation(walkModel, gameState);
  const start = projectPointToWalkGraph(origin, activeGraph, gameState);
  const destination = projectPointToWalkGraph(requestedDestination, activeGraph, gameState);
  const adjacency = createAdjacency(activeGraph);
  connectProjection(adjacency, START_ID, start);
  connectProjection(adjacency, DESTINATION_ID, destination);
  if (start.segment === destination.segment) {
    connect(
      adjacency,
      START_ID,
      DESTINATION_ID,
      Math.abs(start.progress - destination.progress) * start.segment.length,
    );
  }

  const ids = shortestPath(adjacency, START_ID, DESTINATION_ID);
  const nodeById = new Map(activeGraph.nodes.map((node) => [node.id, node]));
  const points = ids.map((id) => {
    if (id === START_ID) return start.point;
    if (id === DESTINATION_ID) return destination.point;
    const node = nodeById.get(id);
    return { x: node.x, y: node.y };
  });

  return {
    route: removeConsecutiveDuplicatePoints(points),
    arrivalNodeId: arrivalNodeIdForProjection(destination),
  };
}

export function arrivalNodeIdForProjection(projection) {
  if (projection.progress <= POSITION_EPSILON) {
    return projection.segment.from;
  }
  if (projection.progress >= 1 - POSITION_EPSILON) {
    return projection.segment.to;
  }
  return null;
}

function activeGraphForNavigation(walkModel, gameState) {
  if (gameState === undefined) {
    if (walkModel.segments.some((segment) => segment.enabledWhen !== null)) {
      throw new Error("La navegación condicionada requiere gameState.");
    }
    return walkModel;
  }
  return resolveActiveWalkGraph(walkModel, gameState);
}

function createAdjacency(walkModel) {
  const adjacency = new Map(walkModel.nodes.map((node) => [node.id, []]));
  walkModel.segments.forEach((segment) => {
    connect(adjacency, segment.from, segment.to, segment.length);
  });
  return adjacency;
}

function connectProjection(adjacency, projectionId, projection) {
  adjacency.set(projectionId, []);
  connect(
    adjacency,
    projectionId,
    projection.segment.from,
    projection.progress * projection.segment.length,
  );
  connect(
    adjacency,
    projectionId,
    projection.segment.to,
    (1 - projection.progress) * projection.segment.length,
  );
}

function connect(adjacency, left, right, distance) {
  adjacency.get(left).push({ id: right, distance });
  adjacency.get(right).push({ id: left, distance });
}

function shortestPath(adjacency, startId, destinationId) {
  const distances = new Map([...adjacency.keys()].map((id) => [id, Infinity]));
  const previous = new Map();
  const unvisited = new Set(adjacency.keys());
  distances.set(startId, 0);

  while (unvisited.size > 0) {
    const current = [...unvisited].reduce((nearest, id) => (
      nearest === null || distances.get(id) < distances.get(nearest) ? id : nearest
    ), null);
    if (current === destinationId || distances.get(current) === Infinity) {
      break;
    }
    unvisited.delete(current);
    adjacency.get(current).forEach((edge) => {
      if (!unvisited.has(edge.id)) return;
      const candidate = distances.get(current) + edge.distance;
      if (candidate < distances.get(edge.id)) {
        distances.set(edge.id, candidate);
        previous.set(edge.id, current);
      }
    });
  }

  if (distances.get(destinationId) === Infinity) {
    throw new Error("No existe una ruta entre el personaje y el destino.");
  }
  const path = [destinationId];
  while (path[0] !== startId) {
    path.unshift(previous.get(path[0]));
  }
  return path;
}

function removeConsecutiveDuplicatePoints(points) {
  return points.filter((point, index) => index === 0 || (
    Math.hypot(point.x - points[index - 1].x, point.y - points[index - 1].y)
      > POSITION_EPSILON
  ));
}
