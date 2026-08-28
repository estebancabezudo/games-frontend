import { createSceneActor } from "./actor-model.js";

export function createSceneCharacter(value, gameState) {
  return value === undefined ? null : createSceneActor(value, "character", gameState);
}
