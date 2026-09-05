import { createFlagCondition, matchesFlagCondition } from "./flag-condition.js";

export function createHotspotAvailability(value, gameState, path) {
  return value === undefined
    ? null
    : createFlagCondition(value, gameState, path);
}

export function hotspotIsEnabled(hotspot, gameState) {
  return hotspot.enabledWhen == null
    || matchesFlagCondition(hotspot.enabledWhen, gameState);
}
