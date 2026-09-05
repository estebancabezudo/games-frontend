export function createDialogueRuntime() {
  return { currentDialogue: null };
}

export function dialogueIsActive(runtime) {
  return runtime.currentDialogue !== null;
}

export function dialogueBlocksGameInput(runtime) {
  return dialogueIsActive(runtime);
}

export function startDialogue(runtime, dialogueId, dialogues) {
  if (dialogueIsActive(runtime)) {
    throw new Error(
      `No se puede iniciar ${dialogueId}; ya está activo el diálogo ${runtime.currentDialogue.dialogueId}.`,
    );
  }
  requireDialogue(dialogueId, dialogues);
  runtime.currentDialogue = { dialogueId, lineIndex: 0 };
  return currentDialogueLine(runtime, dialogues);
}

export function currentDialogueLine(runtime, dialogues) {
  if (!dialogueIsActive(runtime)) {
    return null;
  }
  const dialogue = requireDialogue(runtime.currentDialogue.dialogueId, dialogues);
  return dialogue.lines[runtime.currentDialogue.lineIndex] ?? null;
}

export function advanceDialogue(runtime, dialogues) {
  if (!dialogueIsActive(runtime)) {
    return null;
  }
  const dialogue = requireDialogue(runtime.currentDialogue.dialogueId, dialogues);
  const nextIndex = runtime.currentDialogue.lineIndex + 1;
  if (nextIndex >= dialogue.lines.length) {
    runtime.currentDialogue = null;
    return null;
  }
  runtime.currentDialogue.lineIndex = nextIndex;
  return dialogue.lines[nextIndex];
}

function requireDialogue(dialogueId, dialogues) {
  const dialogue = dialogues.find((candidate) => candidate.id === dialogueId);
  if (dialogue === undefined) {
    throw new Error(`El diálogo no existe: ${dialogueId}.`);
  }
  return dialogue;
}
