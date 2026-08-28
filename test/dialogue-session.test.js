import assert from "node:assert/strict";
import test from "node:test";
import { reconcilePatrolRuntime } from "../actor-patrol.js";
import {
  beginDialogueSession,
  clearDialogueVisualOverrides,
  createDialogueSessionRuntime,
  endDialogueSession,
  finishDialogueSpeakerTalking,
  markDialogueLineSpeaker,
  markDialogueSpeaker,
} from "../dialogue-session.js";
import { createWalkModel } from "../walk-model.js";

function runtime({
  x = 0,
  y = 0,
  directions = 4,
  facing = "right",
  autonomous = false,
} = {}) {
  return {
    position: { x, y },
    destination: { x: x + 100, y },
    route: [{ x: x + 100, y }],
    facing,
    facingDirections: directions,
    motion: "walking",
    visualStateOverride: null,
    visualStateRevision: 0,
    bounds: null,
    autonomousMovement: autonomous
      ? { type: "patrol", nextPointIndex: 1, error: null }
      : null,
  };
}

function movementFor(actorRuntime, stops) {
  return {
    stop() {
      stops.push(actorRuntime);
      actorRuntime.destination = null;
      actorRuntime.route = [];
      actorRuntime.motion = "idle";
    },
  };
}

test("pauses controlled and autonomous participants but not a non-participant", () => {
  const player = runtime({ x: 100, y: 100 });
  const dog = runtime({ x: 300, y: 100, directions: 2, autonomous: true });
  const waiter = runtime({ x: 500, y: 100, autonomous: true });
  const actorsRuntime = { player, dog, waiter };
  const stops = [];
  const movements = new Map(Object.entries(actorsRuntime).map(([id, actorRuntime]) => [
    id,
    movementFor(actorRuntime, stops),
  ]));
  const playerPosition = { ...player.position };
  const dogPosition = { ...dog.position };

  const session = createDialogueSessionRuntime();
  beginDialogueSession(
    session,
    { participantIds: ["player", "dog"] },
    actorsRuntime,
    movements,
  );

  assert.deepEqual(session.participantIds, ["player", "dog"]);
  assert.deepEqual(stops, [player, dog]);
  assert.equal(player.destination, null);
  assert.deepEqual(player.route, []);
  assert.equal(player.motion, "idle");
  assert.equal(dog.destination, null);
  assert.deepEqual(dog.route, []);
  assert.equal(dog.motion, "idle");
  assert.deepEqual(player.position, playerPosition);
  assert.deepEqual(dog.position, dogPosition);
  assert.equal(dog.autonomousMovement.nextPointIndex, 1);
  assert.notEqual(waiter.destination, null);
  assert.equal(waiter.motion, "walking");
});

test("two participants face each other with 2, 4, and 8 directions", () => {
  const cases = [
    {
      directions: 2,
      left: { x: 0, y: 10, facing: "left" },
      right: { x: 20, y: 0, facing: "right" },
      expected: ["right", "left"],
    },
    {
      directions: 4,
      left: { x: 0, y: 20, facing: "right" },
      right: { x: 0, y: 0, facing: "left" },
      expected: ["up", "down"],
    },
    {
      directions: 8,
      left: { x: 0, y: 20, facing: "right" },
      right: { x: 20, y: 0, facing: "left" },
      expected: ["up_right", "down_left"],
    },
  ];

  cases.forEach(({ directions, left, right, expected }) => {
    const leftRuntime = runtime({ ...left, directions });
    const rightRuntime = runtime({ ...right, directions });
    beginDialogueSession(
      createDialogueSessionRuntime(),
      { participantIds: ["left", "right"] },
      { left: leftRuntime, right: rightRuntime },
      new Map(),
    );
    assert.deepEqual([leftRuntime.facing, rightRuntime.facing], expected);
  });
});

test("marks only the current speaker and changes speaker immediately", () => {
  const player = runtime();
  const dog = runtime({ x: 200, directions: 2 });
  const actorsRuntime = { player, dog };
  const session = createDialogueSessionRuntime();
  beginDialogueSession(
    session,
    { participantIds: ["player", "dog"] },
    actorsRuntime,
    new Map(),
  );

  assert.equal(markDialogueSpeaker(session, "player", actorsRuntime), true);
  assert.equal(player.visualStateOverride, "talking");
  assert.equal(dog.visualStateOverride, null);
  assert.equal(player.motion, "idle");
  assert.equal(dog.motion, "idle");

  assert.equal(markDialogueSpeaker(session, "dog", actorsRuntime), true);
  assert.equal(player.visualStateOverride, null);
  assert.equal(dog.visualStateOverride, "talking");
  assert.equal(session.speakerId, "dog");
});

test("consecutive lines by the same speaker preserve the talking override", () => {
  const player = runtime();
  const session = createDialogueSessionRuntime();
  beginDialogueSession(
    session,
    { participantIds: ["player"] },
    { player },
    new Map(),
  );
  const updates = [];
  markDialogueSpeaker(session, "player", { player }, (actorId) => updates.push(actorId));
  const override = player.visualStateOverride;

  assert.equal(
    markDialogueSpeaker(session, "player", { player }, (actorId) => updates.push(actorId)),
    false,
  );
  assert.equal(player.visualStateOverride, override);
  assert.deepEqual(updates, ["player"]);
});

test("consecutive lines by the same speaker restart talking as new phrases", () => {
  const player = runtime();
  const session = createDialogueSessionRuntime();
  beginDialogueSession(session, { participantIds: ["player"] }, { player }, new Map());
  const updates = [];

  markDialogueLineSpeaker(session, "player", { player }, () => updates.push("first"));
  const firstRevision = player.visualStateRevision;
  markDialogueLineSpeaker(session, "player", { player }, () => updates.push("second"));

  assert.equal(player.visualStateOverride, "talking");
  assert.equal(player.visualStateRevision, firstRevision + 1);
  assert.deepEqual(updates, ["first", "second"]);
});

test("finishing talking preserves speaker and paused motion", () => {
  const dog = runtime({ autonomous: true });
  const session = createDialogueSessionRuntime();
  beginDialogueSession(
    session,
    { participantIds: ["dog"] },
    { dog },
    new Map([["dog", movementFor(dog, [])]]),
  );
  markDialogueLineSpeaker(session, "dog", { dog });

  assert.equal(finishDialogueSpeakerTalking(session, "dog", { dog }), true);
  assert.equal(session.speakerId, "dog");
  assert.equal(dog.visualStateOverride, null);
  assert.equal(dog.motion, "idle");
  assert.equal(dog.destination, null);
});

test("closing a dialogue clears every participant visual override", () => {
  const player = runtime();
  const dog = runtime({ x: 200 });
  const actorsRuntime = { player, dog };
  const session = createDialogueSessionRuntime();
  beginDialogueSession(
    session,
    { participantIds: ["player", "dog"] },
    actorsRuntime,
    new Map(),
  );
  markDialogueSpeaker(session, "dog", actorsRuntime);
  clearDialogueVisualOverrides(session, actorsRuntime);

  assert.equal(player.visualStateOverride, null);
  assert.equal(dog.visualStateOverride, null);
  assert.equal(session.speakerId, null);
});

test("one participant and three participants preserve their facing", () => {
  const one = runtime({ facing: "left" });
  beginDialogueSession(
    createDialogueSessionRuntime(),
    { participantIds: ["one"] },
    { one },
    new Map(),
  );
  assert.equal(one.facing, "left");

  const actorsRuntime = {
    one: runtime({ facing: "up" }),
    two: runtime({ facing: "down" }),
    three: runtime({ facing: "left" }),
  };
  beginDialogueSession(
    createDialogueSessionRuntime(),
    { participantIds: ["one", "two", "three"] },
    actorsRuntime,
    new Map(),
  );
  assert.deepEqual(
    Object.values(actorsRuntime).map((actorRuntime) => actorRuntime.facing),
    ["up", "down", "left"],
  );
});

test("ending a session releases participants without restoring old routes", () => {
  const player = runtime();
  const session = createDialogueSessionRuntime();
  beginDialogueSession(
    session,
    { participantIds: ["player"] },
    { player },
    new Map([["player", movementFor(player, [])]]),
  );
  const released = [];
  endDialogueSession(session, (actorId) => released.push(actorId));

  assert.deepEqual(released, ["player"]);
  assert.deepEqual(session.participantIds, []);
  assert.equal(player.destination, null);
  assert.deepEqual(player.route, []);
  assert.equal(player.motion, "idle");
});

test("ending resumes an enabled patrol from its current position and next index", () => {
  const dog = runtime({ x: 40, y: 0, directions: 2, autonomous: true });
  const actor = {
    id: "dog",
    movement: {
      type: "patrol",
      enabledWhen: null,
      points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
    },
  };
  const walk = createWalkModel({
    nodes: [{ id: "left", x: 0, y: 0 }, { id: "right", x: 100, y: 0 }],
    paths: [{ from: "left", to: "right" }],
  });
  const session = createDialogueSessionRuntime();
  beginDialogueSession(
    session,
    { participantIds: ["dog"] },
    { dog },
    new Map([["dog", movementFor(dog, [])]]),
  );
  endDialogueSession(session, () => {
    assert.equal(
      reconcilePatrolRuntime(actor, dog, { flags: {} }, walk, { width: 100, height: 100 }),
      "start",
    );
  });

  assert.equal(dog.autonomousMovement.nextPointIndex, 1);
  assert.deepEqual(dog.position, { x: 40, y: 0 });
  assert.deepEqual(dog.destination, { x: 100, y: 0 });
  assert.equal(dog.motion, "walking");
});

test("ending does not resume a patrol disabled by its flag", () => {
  const dog = runtime({ x: 40, y: 0, directions: 2, autonomous: true });
  const actor = {
    id: "dog",
    movement: {
      type: "patrol",
      enabledWhen: { flag: "dog_fed", value: false },
      points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
    },
  };
  const session = createDialogueSessionRuntime();
  beginDialogueSession(
    session,
    { participantIds: ["dog"] },
    { dog },
    new Map([["dog", movementFor(dog, [])]]),
  );
  endDialogueSession(session, () => {
    assert.equal(
      reconcilePatrolRuntime(
        actor,
        dog,
        { flags: { dog_fed: true } },
        null,
        { width: 100, height: 100 },
      ),
      "none",
    );
  });

  assert.equal(dog.destination, null);
  assert.equal(dog.motion, "idle");
  assert.equal(dog.autonomousMovement.nextPointIndex, 1);
});

test("starting a second physical session changes no additional actors", () => {
  const first = runtime();
  const second = runtime({ x: 300 });
  const secondBefore = structuredClone(second);
  const session = createDialogueSessionRuntime();
  beginDialogueSession(
    session,
    { participantIds: ["first"] },
    { first, second },
    new Map(),
  );

  assert.throws(
    () => beginDialogueSession(
      session,
      { participantIds: ["second"] },
      { first, second },
      new Map(),
    ),
    /sesión física de diálogo activa/,
  );
  assert.deepEqual(second, secondBefore);
});

test("dialogue and declared actor models remain unchanged", () => {
  const dialogue = { participantIds: ["player", "dog"] };
  const dialogueBefore = structuredClone(dialogue);
  const actorsRuntime = { player: runtime(), dog: runtime({ x: 200 }) };
  beginDialogueSession(
    createDialogueSessionRuntime(),
    dialogue,
    actorsRuntime,
    new Map(),
  );
  assert.deepEqual(dialogue, dialogueBefore);
});
