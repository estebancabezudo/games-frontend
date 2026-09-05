import { matchesFlagCondition } from "./flag-condition.js";

export function isSceneElementVisible(element, gameState) {
  if (element.visibleWhen === null) {
    return true;
  }

  return matchesFlagCondition(element.visibleWhen, gameState);
}
