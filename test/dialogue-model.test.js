import assert from "node:assert/strict";
import test from "node:test";
import {
  createDialogueModel,
  validateDialogueActors,
} from "../dialogue-model.js";

const actors = [{ id: "player" }, { id: "dog" }];

test("creates a valid linear dialogue", () => {
  const dialogues = createDialogueModel([{
    id: "dog_warning",
    lines: [
      { actor: "player", text: "Tranquilo." },
      { actor: "dog", text: "Grrrr..." },
    ],
  }]);

  validateDialogueActors(dialogues, actors);
  assert.deepEqual(dialogues, [{
    id: "dog_warning",
    lines: [
      { actorId: "player", text: "Tranquilo." },
      { actorId: "dog", text: "Grrrr..." },
    ],
    participantIds: ["player", "dog"],
  }]);
});

test("extracts unique participants in first-appearance order", () => {
  const [dialogue] = createDialogueModel([{
    id: "meeting",
    lines: [
      { actor: "player", text: "Uno" },
      { actor: "dog", text: "Dos" },
      { actor: "player", text: "Tres" },
      { actor: "waiter", text: "Cuatro" },
    ],
  }]);

  assert.deepEqual(dialogue.participantIds, ["player", "dog", "waiter"]);
});

test("supports a dialogue with one participant", () => {
  const [dialogue] = createDialogueModel([{
    id: "monologue",
    lines: [{ actor: "player", text: "Hmm..." }],
  }]);

  assert.deepEqual(dialogue.participantIds, ["player"]);
});

test("rejects duplicate dialogue ids", () => {
  assert.throws(
    () => createDialogueModel([
      { id: "warning", lines: [{ actor: "dog", text: "Uno" }] },
      { id: "warning", lines: [{ actor: "dog", text: "Dos" }] },
    ]),
    /id duplicado: warning/,
  );
});

test("rejects empty lines and empty text", () => {
  assert.throws(
    () => createDialogueModel([{ id: "empty", lines: [] }]),
    /al menos una línea/,
  );
  assert.throws(
    () => createDialogueModel([{
      id: "empty_text",
      lines: [{ actor: "dog", text: "  " }],
    }]),
    /text debe ser un texto no vacío/,
  );
});

test("rejects a dialogue line with an unknown actor", () => {
  const dialogues = createDialogueModel([{
    id: "ghost",
    lines: [{ actor: "ghost", text: "Hola" }],
  }]);
  assert.throws(
    () => validateDialogueActors(dialogues, actors),
    /actor inexistente: ghost/,
  );
});
