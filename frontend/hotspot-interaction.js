import { calculateWalkRoute } from "./walk-navigation.js";

export function calculateHotspotApproachRoute(walkModel, origin, hotspot, gameState) {
  if (hotspot.approach === null) {
    throw new Error(`El hotspot ${hotspot.id} no declara approach.`);
  }
  if (walkModel === null) {
    throw new Error(`El hotspot ${hotspot.id} requiere una red walk.`);
  }
  return calculateWalkRoute(walkModel, origin, hotspot.approach, gameState);
}
