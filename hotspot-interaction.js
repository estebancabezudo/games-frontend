import { calculateWalkRoute } from "./walk-navigation.js";
import { setCharacterFacing } from "./character-runtime.js";

export function calculateHotspotApproachRoute(walkModel, origin, hotspot, gameState) {
  if (hotspot.approach === null) {
    throw new Error(`El hotspot ${hotspot.id} no declara approach.`);
  }
  if (walkModel === null) {
    throw new Error(`El hotspot ${hotspot.id} requiere una red walk.`);
  }
  return calculateWalkRoute(walkModel, origin, hotspot.approach, gameState);
}

export function completeHotspotApproach(
  characterRuntime,
  resolveTarget,
  onFacingChange = () => {},
) {
  const { hotspot, result } = resolveTarget();
  if (hotspot === undefined) {
    throw new Error("El hotspot completado ya no existe.");
  }
  const facing = hotspot.approach?.facing ?? null;
  if (facing !== null) {
    const visualChanged = characterRuntime.facing !== facing
      || characterRuntime.motion !== "idle";
    setCharacterFacing(characterRuntime, facing);
    if (visualChanged) {
      onFacingChange(characterRuntime.position, characterRuntime.facing, characterRuntime.motion);
    }
  }
  return result;
}
