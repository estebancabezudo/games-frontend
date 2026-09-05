import { matchesFlagCondition } from "./flag-condition.js";

export function sceneObjectActionIsAvailable(action, gameState) {
  return action.enabledWhen == null
    || matchesFlagCondition(action.enabledWhen, gameState);
}
