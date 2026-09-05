export function createDialogueModel(value) {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error("dialogues debe ser una lista.");
  }

  const ids = new Set();
  return value.map((dialogue, index) => {
    const path = `dialogues[${index}]`;
    const definition = requiredObject(dialogue, path);
    const id = requiredText(definition.id, `${path}.id`);
    if (ids.has(id)) {
      throw new Error(`dialogues contiene un id duplicado: ${id}.`);
    }
    ids.add(id);
    if (!Array.isArray(definition.lines) || definition.lines.length === 0) {
      throw new Error(`${path}.lines debe contener al menos una línea.`);
    }
    const lines = definition.lines.map((line, lineIndex) => {
      const linePath = `${path}.lines[${lineIndex}]`;
      const lineDefinition = requiredObject(line, linePath);
      return {
        actorId: requiredText(lineDefinition.actor, `${linePath}.actor`),
        text: requiredText(lineDefinition.text, `${linePath}.text`),
      };
    });
    return {
      id,
      lines,
      participantIds: [...new Set(lines.map((line) => line.actorId))],
    };
  });
}

export function validateDialogueActors(dialogues, actors) {
  const actorIds = new Set(actors.map((actor) => actor.id));
  dialogues.forEach((dialogue) => {
    dialogue.lines.forEach((line, index) => {
      if (!actorIds.has(line.actorId)) {
        throw new Error(
          `dialogues.${dialogue.id}.lines[${index}].actor refiere a un actor inexistente: ${line.actorId}.`,
        );
      }
    });
  });
  return dialogues;
}

function requiredObject(value, path) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} debe ser un objeto.`);
  }
  return value;
}

function requiredText(value, path) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${path} debe ser un texto no vacío.`);
  }
  return value.trim();
}
