import assert from "node:assert/strict";
import test from "node:test";
import { createSceneEntries } from "../scene-entry-model.js";

const FACINGS = {
  1: ["default"],
  2: ["left", "right"],
  4: ["up", "right", "down", "left"],
  8: ["up", "up_right", "right", "down_right", "down", "down_left", "left", "up_left"],
};

function controlledActor(directions = 4) {
  return { visual: { directions } };
}

test("entries default to an empty list and normalize independent copies", () => {
  assert.deepEqual(createSceneEntries(undefined, null), []);
  const source = [{ id: " arrival ", position: { x: 10, y: 20 } }];
  const entries = createSceneEntries(source, controlledActor());
  assert.deepEqual(entries, [{ id: "arrival", position: { x: 10, y: 20 }, facing: null }]);
  assert.notEqual(entries[0], source[0]);
  assert.notEqual(entries[0].position, source[0].position);
  source[0].position.x = 99;
  assert.equal(entries[0].position.x, 10);
});

test("accepts every facing supported by 1, 2, 4, and 8 direction actors", () => {
  Object.entries(FACINGS).forEach(([directions, facings]) => {
    facings.forEach((facing) => {
      const [entry] = createSceneEntries(
        [{ id: facing, position: { x: 0, y: 0 }, facing }],
        controlledActor(Number(directions)),
      );
      assert.equal(entry.facing, facing);
    });
  });
});

test("rejects invalid entry collections, definitions, ids, and positions", () => {
  const actor = controlledActor();
  assert.throws(() => createSceneEntries({}, actor), /entries debe ser una lista/);
  assert.throws(() => createSceneEntries([null], actor), /entries\[0\] debe ser un objeto/);
  assert.throws(() => createSceneEntries([{ id: "", position: { x: 0, y: 0 } }], actor), /entries\[0\]\.id/);
  assert.throws(() => createSceneEntries([
    { id: "same", position: { x: 0, y: 0 } },
    { id: "same", position: { x: 1, y: 1 } },
  ], actor), /id duplicado: same/);
  for (const position of [{ x: 1 }, { x: -1, y: 0 }, { x: 0, y: Infinity }, { x: "0", y: 0 }]) {
    assert.throws(
      () => createSceneEntries([{ id: "entry", position }], actor),
      /entries\[0\]\.position\.(x|y)/,
    );
  }
});

test("rejects unknown properties, actorless entries, and incompatible facing", () => {
  assert.throws(
    () => createSceneEntries([{ id: "e", position: { x: 0, y: 0 }, extra: true }], controlledActor()),
    /entries\[0\].*propiedades desconocidas: extra/,
  );
  assert.throws(
    () => createSceneEntries([{ id: "e", position: { x: 0, y: 0, z: 1 } }], controlledActor()),
    /entries\[0\]\.position.*propiedades desconocidas: z/,
  );
  assert.throws(
    () => createSceneEntries([{ id: "e", position: { x: 0, y: 0 } }], null),
    /entries requiere que la escena tenga un actor controlado/,
  );
  assert.throws(
    () => createSceneEntries([{ id: "e", position: { x: 0, y: 0 }, facing: "" }], controlledActor()),
    /entries\[0\]\.facing debe ser texto no vacío/,
  );
  assert.throws(
    () => createSceneEntries([{ id: "e", position: { x: 0, y: 0 }, facing: "up" }], controlledActor(2)),
    /entries\[0\]\.facing no es compatible/,
  );
});

test("entry ids are scoped to each scene collection", () => {
  const first = createSceneEntries([{ id: "door", position: { x: 1, y: 2 } }], controlledActor());
  const second = createSceneEntries([{ id: "door", position: { x: 3, y: 4 } }], controlledActor());
  assert.equal(first[0].id, second[0].id);
  assert.notDeepEqual(first[0].position, second[0].position);
});
