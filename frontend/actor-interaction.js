import {
  calculateWalkRoute,
  projectPointToSegment,
  projectPointToWalkGraph,
} from "./walk-navigation.js";
import { resolveActiveWalkGraph } from "./walk-model.js";

const DISTANCE_EPSILON = 0.000001;

export function calculateActorApproachRoute(
  walkModel,
  origin,
  targetPosition,
  approachDistance,
  gameState,
) {
  if (walkModel === null) {
    throw new Error("La interacción con actor requiere una red walk.");
  }
  const approach = calculateActorApproachPoint(
    walkModel,
    origin,
    targetPosition,
    approachDistance,
    gameState,
  );
  return calculateWalkRoute(walkModel, origin, approach.point, gameState);
}

export function calculateActorApproachPoint(
  walkModel,
  origin,
  targetPosition,
  approachDistance,
  gameState,
) {
  const targetProjection = projectPointToWalkGraph(targetPosition, walkModel, gameState);
  const activeSegments = activeWalkSegments(walkModel, gameState);
  const candidates = actorApproachCandidates(
    activeSegments,
    targetPosition,
    approachDistance,
    targetProjection,
  );
  const accessible = candidates.flatMap((candidate) => {
    try {
      const route = calculateWalkRoute(walkModel, origin, candidate.point, gameState);
      return [{ ...candidate, routeDistance: routeLength(origin, route) }];
    } catch {
      return [];
    }
  });
  if (accessible.length === 0) {
    throw new Error("No existe una ruta entre el actor controlado y el actor objetivo.");
  }
  accessible.sort((left, right) => (
    left.distanceError - right.distanceError
    || left.routeDistance - right.routeDistance
    || left.order - right.order
  ));
  return {
    point: { ...accessible[0].point },
    distanceFromActor: accessible[0].distanceFromActor,
    requestedDistance: approachDistance,
  };
}

function actorApproachCandidates(
  segments,
  targetPosition,
  approachDistance,
  targetProjection,
) {
  const candidates = [];
  segments.forEach((segment, segmentIndex) => {
    circleIntersections(targetPosition, approachDistance, segment).forEach((point) => {
      addCandidate(candidates, point, targetPosition, approachDistance, segmentIndex);
    });
    addCandidate(
      candidates,
      segment.start,
      targetPosition,
      approachDistance,
      segmentIndex,
    );
    addCandidate(
      candidates,
      segment.end,
      targetPosition,
      approachDistance,
      segmentIndex,
    );
  });
  addCandidate(
    candidates,
    targetProjection.point,
    targetPosition,
    approachDistance,
    segments.indexOf(targetProjection.segment),
  );
  return candidates;
}

function activeWalkSegments(walkModel, gameState) {
  return gameState === undefined
    ? walkModel.segments
    : resolveActiveWalkGraph(walkModel, gameState).segments;
}

function circleIntersections(center, radius, segment) {
  if (radius === 0) {
    return [projectPointToSegment(center, segment).point];
  }
  const deltaX = segment.end.x - segment.start.x;
  const deltaY = segment.end.y - segment.start.y;
  const offsetX = segment.start.x - center.x;
  const offsetY = segment.start.y - center.y;
  const a = deltaX ** 2 + deltaY ** 2;
  if (a === 0) {
    return [{ ...segment.start }];
  }
  const b = 2 * (offsetX * deltaX + offsetY * deltaY);
  const c = offsetX ** 2 + offsetY ** 2 - radius ** 2;
  const discriminant = b ** 2 - 4 * a * c;
  if (discriminant < 0) {
    return [];
  }
  const root = Math.sqrt(Math.max(0, discriminant));
  return [(-b - root) / (2 * a), (-b + root) / (2 * a)]
    .filter((progress, index, values) => (
      progress >= 0
      && progress <= 1
      && (index === 0 || Math.abs(progress - values[0]) > DISTANCE_EPSILON)
    ))
    .map((progress) => ({
      x: segment.start.x + deltaX * progress,
      y: segment.start.y + deltaY * progress,
    }));
}

function addCandidate(candidates, point, targetPosition, requestedDistance, order) {
  if (candidates.some((candidate) => pointsEqual(candidate.point, point))) {
    return;
  }
  const distanceFromActor = Math.hypot(
    point.x - targetPosition.x,
    point.y - targetPosition.y,
  );
  candidates.push({
    point: { x: point.x, y: point.y },
    distanceFromActor,
    distanceError: Math.abs(distanceFromActor - requestedDistance),
    order,
  });
}

function routeLength(origin, route) {
  let previous = origin;
  return route.reduce((distance, point) => {
    const nextDistance = distance + Math.hypot(
      point.x - previous.x,
      point.y - previous.y,
    );
    previous = point;
    return nextDistance;
  }, 0);
}

function pointsEqual(left, right) {
  return Math.hypot(left.x - right.x, left.y - right.y) <= DISTANCE_EPSILON;
}
