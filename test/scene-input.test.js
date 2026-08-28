import assert from "node:assert/strict";
import test from "node:test";
import {
  captureInteractiveActorPointer,
  handleActorPressEvent,
  handleActorPointerDownEvent,
  handleHotspotPressEvent,
  handleScenePressEvent,
  walkSegmentOverlayState,
} from "../scene-renderer.js";

const sceneModel = {
  controlledActorId: "player",
  size: { width: 3000, height: 1920 },
};
const camera = { x: 400, viewportWorldWidth: 1000 };
const canvasBounds = {
  left: 100,
  top: 100,
  width: 500,
  height: 600,
};
const sceneEvent = { clientX: 400, clientY: 400 };

function dispatchActorClick(actor, controlledActorId = "player") {
  let propagationStopped = false;
  const actorPresses = [];
  const sceneDestinations = [];
  const event = {
    ...sceneEvent,
    stopPropagation() {
      propagationStopped = true;
    },
  };

  handleActorPressEvent(
    event,
    actor,
    controlledActorId,
    (pressedActor) => actorPresses.push(pressedActor.id),
  );
  if (!propagationStopped) {
    handleScenePressEvent(
      event,
      sceneModel,
      camera,
      canvasBounds,
      (destination) => sceneDestinations.push(destination),
    );
  }
  return { actorPresses, sceneDestinations, propagationStopped };
}

test("clicking a free scene area calls the movement behavior", () => {
  const destinations = [];

  const handled = handleScenePressEvent(
    sceneEvent,
    sceneModel,
    camera,
    canvasBounds,
    (destination) => destinations.push(destination),
  );

  assert.equal(handled, true);
  assert.deepEqual(destinations, [{ x: 1000, y: 960 }]);
});

test("clicking the controlled actor bubbles to the scene behavior", () => {
  const result = dispatchActorClick({ id: "player", interactions: { effects: [] } });

  assert.equal(result.propagationStopped, false);
  assert.deepEqual(result.actorPresses, []);
  assert.deepEqual(result.sceneDestinations, [{ x: 1000, y: 960 }]);
});

test("clicking a non-interactive actor bubbles to the scene behavior", () => {
  const result = dispatchActorClick({ id: "cat", interactions: null });

  assert.equal(result.propagationStopped, false);
  assert.deepEqual(result.actorPresses, []);
  assert.deepEqual(result.sceneDestinations, [{ x: 1000, y: 960 }]);
});

test("clicking an interactive actor consumes the event without moving", () => {
  const result = dispatchActorClick({ id: "dog", interactions: { effects: [] } });

  assert.equal(result.propagationStopped, true);
  assert.deepEqual(result.actorPresses, ["dog"]);
  assert.deepEqual(result.sceneDestinations, []);
});

test("an interactive moving actor captures the pointer until click completes", () => {
  const capturedPointers = [];
  const event = {
    pointerId: 17,
    currentTarget: {
      setPointerCapture(pointerId) {
        capturedPointers.push(pointerId);
      },
    },
  };

  assert.equal(
    captureInteractiveActorPointer(
      event,
      { id: "dog", interactions: { effects: [] } },
      "player",
    ),
    true,
  );
  assert.deepEqual(capturedPointers, [17]);
});

test("pointerdown activates an interactive moving actor before its DOM node moves", () => {
  const capturedPointers = [];
  const actorPresses = [];
  let propagationStopped = false;
  const actor = { id: "dog", interactions: { effects: [] } };
  const event = {
    pointerId: 23,
    currentTarget: {
      setPointerCapture(pointerId) {
        capturedPointers.push(pointerId);
      },
    },
    stopPropagation() {
      propagationStopped = true;
    },
  };

  assert.equal(
    handleActorPointerDownEvent(
      event,
      actor,
      "player",
      (pressedActor) => actorPresses.push(pressedActor.id),
    ),
    true,
  );
  assert.deepEqual(capturedPointers, [23]);
  assert.deepEqual(actorPresses, ["dog"]);
  assert.equal(propagationStopped, true);
});

test("controlled and non-interactive actors do not capture the pointer", () => {
  const capturedPointers = [];
  const event = {
    pointerId: 17,
    currentTarget: {
      setPointerCapture(pointerId) {
        capturedPointers.push(pointerId);
      },
    },
  };

  assert.equal(
    captureInteractiveActorPointer(
      event,
      { id: "player", interactions: { effects: [] } },
      "player",
    ),
    false,
  );
  assert.equal(
    captureInteractiveActorPointer(
      event,
      { id: "cat", interactions: null },
      "player",
    ),
    false,
  );
  assert.deepEqual(capturedPointers, []);
});

test("clicking a hotspot consumes the event without moving", () => {
  let propagationStopped = false;
  const hotspotPresses = [];
  const sceneDestinations = [];
  const event = {
    ...sceneEvent,
    stopPropagation() {
      propagationStopped = true;
    },
  };

  handleHotspotPressEvent(
    event,
    { id: "lever_switch" },
    (hotspot) => hotspotPresses.push(hotspot.id),
  );
  if (!propagationStopped) {
    handleScenePressEvent(
      event,
      sceneModel,
      camera,
      canvasBounds,
      (destination) => sceneDestinations.push(destination),
    );
  }

  assert.equal(propagationStopped, true);
  assert.deepEqual(hotspotPresses, ["lever_switch"]);
  assert.deepEqual(sceneDestinations, []);
});

test("another actor patrol does not prevent controlled actor movement", () => {
  const dogRuntime = {
    position: { x: 2200, y: 1050 },
    destination: { x: 2050, y: 1050 },
    route: [{ x: 2050, y: 1050 }],
    motion: "walking",
  };
  const originalDogRuntime = structuredClone(dogRuntime);
  const playerDestinations = [];

  handleScenePressEvent(
    sceneEvent,
    sceneModel,
    camera,
    canvasBounds,
    (destination) => playerDestinations.push(destination),
  );

  assert.deepEqual(playerDestinations, [{ x: 1000, y: 960 }]);
  assert.deepEqual(dogRuntime, originalDogRuntime);
});

test("walk overlay distinguishes enabled and disabled paths", () => {
  const segment = { enabledWhen: { flag: "gate_open", value: true } };
  assert.equal(walkSegmentOverlayState(segment, { flags: { gate_open: false } }), "disabled");
  assert.equal(walkSegmentOverlayState(segment, { flags: { gate_open: true } }), "enabled");
  assert.equal(walkSegmentOverlayState({ enabledWhen: null }, { flags: {} }), "enabled");
});
