import assert from "node:assert/strict";
import test from "node:test";
import { renderInventory } from "../inventory-view.js";

function viewFixture() {
  const buttons = [];
  const ownerDocument = {
    createElement() {
      const listeners = {};
      return {
        attributes: {},
        addEventListener(type, listener) { listeners[type] = listener; },
        setAttribute(name, value) { this.attributes[name] = value; },
        click() { listeners.click(); },
      };
    },
  };
  return {
    buttons,
    container: {
      ownerDocument,
      replaceChildren(...children) {
        buttons.splice(0, buttons.length, ...children);
      },
    },
  };
}

test("inventory UI immediately reflects its runtime ids and selection", () => {
  const fixture = viewFixture();
  const selected = [];
  renderInventory(
    fixture.container,
    ["dog_food", "brass_key"],
    "brass_key",
    (itemId) => selected.push(itemId),
  );
  assert.deepEqual(fixture.buttons.map((button) => button.textContent), ["dog_food", "brass_key"]);
  assert.deepEqual(fixture.buttons.map((button) => button.attributes["aria-pressed"]), ["false", "true"]);
  fixture.buttons[0].click();
  assert.deepEqual(selected, ["dog_food"]);

  renderInventory(fixture.container, ["brass_key"], null, () => {});
  assert.deepEqual(fixture.buttons.map((button) => button.textContent), ["brass_key"]);
});
