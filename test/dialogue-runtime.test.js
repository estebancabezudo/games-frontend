import assert from "node:assert/strict";
import test from "node:test";
import {
  advanceDialogue,
  createDialogueRuntime,
  currentDialogueLine,
  dialogueBlocksGameInput,
  startDialogue,
} from "../dialogue-runtime.js";

const dialogues = [{
  id: "dog_warning",
  lines: [
    { actorId: "player", text: "Tranquilo." },
    { actorId: "dog", text: "Grrrr..." },
  ],
}];

test("a dialogue starts at line zero and stores no copied lines", () => {
  const runtime = createDialogueRuntime();
  const line = startDialogue(runtime, "dog_warning", dialogues);

  assert.deepEqual(runtime.currentDialogue, {
    dialogueId: "dog_warning",
    lineIndex: 0,
  });
  assert.equal(Object.hasOwn(runtime.currentDialogue, "lines"), false);
  assert.deepEqual(line, dialogues[0].lines[0]);
});

test("continue advances and the last line closes the dialogue", () => {
  const runtime = createDialogueRuntime();
  startDialogue(runtime, "dog_warning", dialogues);

  assert.deepEqual(advanceDialogue(runtime, dialogues), dialogues[0].lines[1]);
  assert.equal(runtime.currentDialogue.lineIndex, 1);
  assert.equal(advanceDialogue(runtime, dialogues), null);
  assert.equal(runtime.currentDialogue, null);
  assert.equal(currentDialogueLine(runtime, dialogues), null);
});

test("an active dialogue blocks game input and finishing returns control", () => {
  const runtime = createDialogueRuntime();
  assert.equal(dialogueBlocksGameInput(runtime), false);
  startDialogue(runtime, "dog_warning", dialogues);
  assert.equal(dialogueBlocksGameInput(runtime), true);
  advanceDialogue(runtime, dialogues);
  advanceDialogue(runtime, dialogues);
  assert.equal(dialogueBlocksGameInput(runtime), false);
});

test("starting another dialogue while one is active reports a runtime error", () => {
  const runtime = createDialogueRuntime();
  startDialogue(runtime, "dog_warning", dialogues);
  assert.throws(
    () => startDialogue(runtime, "dog_warning", dialogues),
    /ya está activo el diálogo dog_warning/,
  );
});

test("dialogue runtime does not alter autonomous actor runtime", () => {
  const runtime = createDialogueRuntime();
  const dogRuntime = {
    position: { x: 2200, y: 1050 },
    motion: "walking",
    route: [{ x: 2350, y: 1050 }],
  };
  const before = structuredClone(dogRuntime);
  startDialogue(runtime, "dog_warning", dialogues);
  advanceDialogue(runtime, dialogues);
  assert.deepEqual(dogRuntime, before);
});
