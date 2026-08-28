import assert from "node:assert/strict";
import test from "node:test";
import {
  finishDialogueSpeakerTalking,
  markDialogueLineSpeaker,
} from "../dialogue-session.js";
import {
  advanceDialogue,
  createDialogueRuntime,
  currentDialogueLine,
  dialogueIsActive,
  startDialogue,
} from "../dialogue-runtime.js";
import {
  calculateTalkingDuration,
  cancelDialogueTalking,
  createDialogueTalkingRuntime,
  startDialogueTalking,
} from "../dialogue-timing.js";

function fakeTimer() {
  let nextId = 0;
  const callbacks = new Map();
  const durations = new Map();
  return {
    set(callback, duration) {
      const id = ++nextId;
      callbacks.set(id, callback);
      durations.set(id, duration);
      return id;
    },
    clear(id) {
      callbacks.delete(id);
    },
    callback(id) {
      return callbacks.get(id);
    },
    duration(id) {
      return durations.get(id);
    },
    fire(id) {
      callbacks.get(id)?.();
    },
  };
}

function actorRuntime() {
  return {
    motion: "idle",
    visualStateOverride: null,
    visualStateRevision: 0,
  };
}

test("talking duration uses trimmed characters with minimum, proportion, and maximum", () => {
  assert.equal(calculateTalkingDuration("Hola."), 600);
  assert.equal(calculateTalkingDuration("1234567890"), 750);
  assert.equal(calculateTalkingDuration("  12345678901234567890  "), 1200);
  assert.equal(calculateTalkingDuration("x".repeat(1000)), 5000);
});

test("timer expiration ends only the current speaker visual", () => {
  const timer = fakeTimer();
  const timing = createDialogueTalkingRuntime(timer);
  const session = { participantIds: ["player"], speakerId: null };
  const actors = { player: actorRuntime() };
  const dialogues = [{
    id: "hello",
    lines: [{ actorId: "player", text: "Una frase visible." }],
  }];
  const dialogue = createDialogueRuntime();
  startDialogue(dialogue, "hello", dialogues);
  markDialogueLineSpeaker(session, "player", actors);
  startDialogueTalking(timing, "player", dialogues[0].lines[0].text, (speakerId) => {
    finishDialogueSpeakerTalking(session, speakerId, actors);
  });

  timer.fire(timing.timerId);

  assert.equal(actors.player.visualStateOverride, null);
  assert.equal(session.speakerId, "player");
  assert.equal(timing.talking, false);
  assert.equal(dialogueIsActive(dialogue), true);
  assert.equal(dialogue.currentDialogue.lineIndex, 0);
  assert.equal(currentDialogueLine(dialogue, dialogues).text, "Una frase visible.");
});

test("continuing early cancels the old callback and protects the next speaker", () => {
  const timer = fakeTimer();
  const timing = createDialogueTalkingRuntime(timer);
  const actors = { player: actorRuntime(), dog: actorRuntime() };
  const session = { participantIds: ["player", "dog"], speakerId: null };
  const dialogues = [{
    id: "talk",
    lines: [
      { actorId: "player", text: "Primera." },
      { actorId: "dog", text: "Segunda." },
    ],
  }];
  const dialogue = createDialogueRuntime();
  const first = startDialogue(dialogue, "talk", dialogues);
  markDialogueLineSpeaker(session, first.actorId, actors);
  startDialogueTalking(timing, first.actorId, first.text, (speakerId) => {
    finishDialogueSpeakerTalking(session, speakerId, actors);
  });
  const obsoleteCallback = timer.callback(timing.timerId);

  cancelDialogueTalking(timing);
  const second = advanceDialogue(dialogue, dialogues);
  markDialogueLineSpeaker(session, second.actorId, actors);
  startDialogueTalking(timing, second.actorId, second.text, (speakerId) => {
    finishDialogueSpeakerTalking(session, speakerId, actors);
  });
  obsoleteCallback();

  assert.equal(session.speakerId, "dog");
  assert.equal(actors.player.visualStateOverride, null);
  assert.equal(actors.dog.visualStateOverride, "talking");
  assert.equal(timing.talking, true);
  assert.equal(dialogue.currentDialogue.lineIndex, 1);
});

test("canceling talking invalidates its timer", () => {
  const timer = fakeTimer();
  const timing = createDialogueTalkingRuntime(timer);
  let finishes = 0;
  startDialogueTalking(timing, "player", "Hola", () => { finishes += 1; });
  const callback = timer.callback(timing.timerId);
  cancelDialogueTalking(timing);
  callback();
  assert.equal(finishes, 0);
  assert.equal(timing.talking, false);
  assert.equal(timing.timerId, null);
});
