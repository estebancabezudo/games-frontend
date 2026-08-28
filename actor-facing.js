const SUPPORTED_DIRECTIONS = new Set([1, 2, 4, 8]);
const ANGLE_EPSILON = 1e-12;
const FOUR_DIRECTIONS = ["right", "down", "left", "up"];
const EIGHT_DIRECTIONS = [
  "right",
  "down_right",
  "down",
  "down_left",
  "left",
  "up_left",
  "up",
  "up_right",
];

export function initialActorFacing(directions) {
  return directions === 1 ? "default" : "right";
}

export function actorFacingFromMovement(dx, dy, directions, previousFacing) {
  if (!SUPPORTED_DIRECTIONS.has(directions)) {
    throw new Error("directions debe ser 1, 2, 4 u 8.");
  }
  const currentFacing = previousFacing ?? initialActorFacing(directions);
  if (dx === 0 && dy === 0) {
    return currentFacing;
  }
  if (directions === 1) {
    return "default";
  }
  if (directions === 2) {
    if (Math.abs(dy) > Math.abs(dx)) {
      return currentFacing === "left" || currentFacing === "right"
        ? currentFacing
        : "right";
    }
    return dx < 0 ? "left" : "right";
  }

  const directionNames = directions === 4 ? FOUR_DIRECTIONS : EIGHT_DIRECTIONS;
  const sectorSize = Math.PI * 2 / directions;
  const normalizedAngle = (Math.atan2(dy, dx) + Math.PI * 2) % (Math.PI * 2);
  const sector = Math.floor(
    (normalizedAngle + sectorSize / 2 + ANGLE_EPSILON) / sectorSize,
  )
    % directions;
  return directionNames[sector];
}
