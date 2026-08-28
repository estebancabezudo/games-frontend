import assert from "node:assert/strict";
import test from "node:test";
import {
  giveInventoryItem,
  takeInventoryItem,
  validSelectedInventoryItem,
} from "../inventory-runtime.js";

test("give_item preserves acquisition order and duplicate acquisition is a no-op", () => {
  const state = { inventory: ["dog_food"] };
  giveInventoryItem(state, "brass_key");
  giveInventoryItem(state, "dog_food");
  assert.deepEqual(state.inventory, ["dog_food", "brass_key"]);
});

test("take_item removes an owned item and a missing item is a no-op", () => {
  const state = { inventory: ["dog_food", "brass_key"] };
  takeInventoryItem(state, "dog_food");
  takeInventoryItem(state, "screwdriver");
  assert.deepEqual(state.inventory, ["brass_key"]);
});

test("removing the selected item clears selection", () => {
  assert.equal(validSelectedInventoryItem("dog_food", []), null);
  assert.equal(validSelectedInventoryItem("dog_food", ["dog_food"]), "dog_food");
});
