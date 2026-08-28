import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveActorVisual,
  resolveActorVisualState,
} from "../character-visual.js";
import { createSceneModel } from "../scene-model.js";

const DIRECTIONS = new Map([
  [1, ["default"]],
  [2, ["left", "right"]],
  [4, ["up", "right", "down", "left"]],
  [8, [
    "up", "up_right", "right", "down_right",
    "down", "down_left", "left", "up_left",
  ]],
]);

function sceneDocument(visual) {
  return {
    game: { id: "example" },
    scene: { id: "room" },
    viewport: { orientation: "portrait" },
    size: { width: 1080, height: 1920 },
    background: { color: "#dddddd" },
    character: {
      id: "player",
      visual,
      position: { x: 540, y: 900 },
      size: { width: 180, height: 420 },
    },
  };
}

function stateAssets(directions, motion) {
  if (directions === 1) {
    return { asset: `assets/player-${motion}.svg` };
  }
  return Object.fromEntries(DIRECTIONS.get(directions).map((direction) => [
    direction,
    `assets/player-${motion}-${direction}.svg`,
  ]));
}

function stateVisual(directions) {
  return {
    directions,
    states: {
      idle: stateAssets(directions, "idle"),
      walking: stateAssets(directions, "walking"),
    },
  };
}

test("normalizes states for 1, 2, 4, and 8 directions", () => {
  [1, 2, 4, 8].forEach((directions) => {
    const visual = createSceneModel(sceneDocument(stateVisual(directions))).character.visual;
    assert.equal(visual.directions, directions);
    assert.deepEqual(Object.keys(visual.states.idle), DIRECTIONS.get(directions));
    assert.deepEqual(Object.keys(visual.states.walking), DIRECTIONS.get(directions));
  });
});

test("resolves idle and walking assets using the current facing", () => {
  const visual = createSceneModel(sceneDocument(stateVisual(4))).character.visual;

  assert.equal(
    resolveActorVisual(visual, "idle", "right").asset,
    "assets/player-idle-right.svg",
  );
  assert.equal(
    resolveActorVisual(visual, "walking", "down").asset,
    "assets/player-walking-down.svg",
  );
});

test("an actor without talking falls back to idle within its visual", () => {
  const visual = createSceneModel(sceneDocument(stateVisual(2))).character.visual;
  const visualState = resolveActorVisualState(visual, "idle", "talking");

  assert.equal(visualState, "idle");
  assert.equal(
    resolveActorVisual(visual, visualState, "right").asset,
    "assets/player-idle-right.svg",
  );
});

test("normalizes and resolves optional talking for 1, 2, 4, and 8 directions", () => {
  [1, 2, 4, 8].forEach((directions) => {
    const definition = stateVisual(directions);
    definition.states.talking = stateAssets(directions, "talking");
    const visual = createSceneModel(sceneDocument(definition)).character.visual;
    const facing = DIRECTIONS.get(directions)[0];

    assert.equal(resolveActorVisualState(visual, "idle", "talking"), "talking");
    assert.equal(
      resolveActorVisual(visual, "talking", facing).asset,
      directions === 1
        ? "assets/player-talking.svg"
        : `assets/player-talking-${facing}.svg`,
    );
  });
});

test("rejects an incomplete talking state", () => {
  const visual = stateVisual(4);
  visual.states.talking = stateAssets(4, "talking");
  delete visual.states.talking.left;

  assert.throws(
    () => createSceneModel(sceneDocument(visual)),
    /talking debe declarar la dirección left/,
  );
});

test("rejects a missing state", () => {
  const visual = stateVisual(2);
  delete visual.states.walking;

  assert.throws(
    () => createSceneModel(sceneDocument(visual)),
    /debe declarar el estado walking/,
  );
});

test("rejects missing and extra directions inside a state", () => {
  const missing = stateVisual(4);
  delete missing.states.walking.left;
  assert.throws(
    () => createSceneModel(sceneDocument(missing)),
    /walking debe declarar la dirección left/,
  );

  const extra = stateVisual(2);
  extra.states.idle.up = "assets/player-idle-up.svg";
  assert.throws(
    () => createSceneModel(sceneDocument(extra)),
    /idle contiene propiedades desconocidas: up/,
  );
});

test("rejects ambiguous mixtures of assets and states", () => {
  const visual = {
    ...stateVisual(4),
    assets: stateAssets(4, "shared"),
  };

  assert.throws(
    () => createSceneModel(sceneDocument(visual)),
    /exactamente uno de asset, assets o states/,
  );
});
