import assert from "node:assert/strict";
import test from "node:test";
import { createItemCatalog } from "../item-model.js";

test("creates a catalog containing only item ids", () => {
  assert.deepEqual(createItemCatalog([
    { id: "dog_food" },
    { id: "brass_key" },
  ]), [
    { id: "dog_food" },
    { id: "brass_key" },
  ]);
});

test("rejects empty and duplicate item ids", () => {
  assert.throws(() => createItemCatalog([{ id: "" }]), /items\[0\]\.id/);
  assert.throws(
    () => createItemCatalog([{ id: "key" }, { id: "key" }]),
    /items contiene un id duplicado: key/,
  );
});
