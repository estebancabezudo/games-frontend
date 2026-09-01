const flagDefinitions = new WeakMap();
const SUPPORTED_OPERATORS = new Set(["and", "or"]);

export function createFlagsState(value, path = "state.flags") {
  const definition = requiredObject(value, path);
  const flags = {};
  const definitions = new Map();

  Object.entries(definition).forEach(([name, rawValue]) => {
    const flagPath = `${path}.${name}`;
    if (typeof rawValue === "boolean") {
      flags[name] = rawValue;
      definitions.set(name, { type: "boolean" });
      return;
    }
    if (typeof rawValue !== "string") {
      throw new Error(`${flagPath} debe ser true, false o una expresión de flags.`);
    }

    const expression = parseFlagExpression(rawValue, flagPath);
    validateOperand(expression.left, name, definitions, `${flagPath}.left`);
    validateOperand(expression.right, name, definitions, `${flagPath}.right`);
    const computedDefinition = { type: "computed", ...expression };
    definitions.set(name, computedDefinition);
    defineComputedFlag(flags, name, computedDefinition);
  });

  flagDefinitions.set(flags, definitions);
  return flags;
}

export function copyFlagsState(sourceFlags) {
  const sourceDefinitions = flagDefinitions.get(sourceFlags);
  const flags = {};
  const definitions = new Map();

  if (sourceDefinitions === undefined) {
    Object.entries(requiredObject(sourceFlags, "flags")).forEach(([name, value]) => {
      if (typeof value !== "boolean") {
        throw new Error(`flags.${name} debe ser true o false para copiarse.`);
      }
      flags[name] = value;
      definitions.set(name, { type: "boolean" });
    });
  } else {
    sourceDefinitions.forEach((definition, name) => {
      if (definition.type === "boolean") {
        flags[name] = sourceFlags[name];
        definitions.set(name, { type: "boolean" });
        return;
      }
      const computedDefinition = { ...definition };
      definitions.set(name, computedDefinition);
      defineComputedFlag(flags, name, computedDefinition);
    });
  }

  flagDefinitions.set(flags, definitions);
  return flags;
}

export function flagIsComputed(gameState, flag) {
  return flagDefinitions.get(gameState?.flags)?.get(flag)?.type === "computed";
}

export function requireMutableFlag(gameState, flag, action, path = action) {
  if (!Object.hasOwn(gameState.flags, flag)) {
    throw new Error(`${path} refiere a un flag no declarado: ${flag}.`);
  }
  if (flagIsComputed(gameState, flag)) {
    throw new Error(`${path}: ${action} no puede modificar directamente el flag calculado: ${flag}.`);
  }
  return flag;
}

export function flagDefinition(gameState, flag) {
  return flagDefinitions.get(gameState?.flags)?.get(flag) ?? null;
}

function defineComputedFlag(flags, name, definition) {
  Object.defineProperty(flags, name, {
    enumerable: true,
    get() {
      const left = flags[definition.left];
      const right = flags[definition.right];
      return definition.operator === "and" ? left && right : left || right;
    },
  });
}

function parseFlagExpression(value, path) {
  const expression = value.trim();
  if (expression === "") {
    throw new Error(`${path} no puede contener una expresión vacía.`);
  }
  if (/[()]/.test(expression)) {
    throw new Error(`${path} no permite paréntesis.`);
  }
  const parts = expression.split(/\s+/);
  if (parts.length < 3) {
    throw new Error(`${path} debe contener operando, operador y operando.`);
  }
  if (parts.length > 3) {
    throw new Error(`${path} debe contener exactamente dos operandos y un operador.`);
  }
  const [left, operator, right] = parts;
  if (!SUPPORTED_OPERATORS.has(operator)) {
    throw new Error(`${path} debe usar el operador and u or en minúsculas: ${operator}.`);
  }
  return { left, operator, right };
}

function validateOperand(operand, flag, definitions, path) {
  if (operand === "true" || operand === "false") {
    throw new Error(`${path} no permite literales booleanos como operandos: ${operand}.`);
  }
  if (operand === flag) {
    throw new Error(`${path} no permite que el flag se refiera a sí mismo: ${flag}.`);
  }
  if (!definitions.has(operand)) {
    throw new Error(`${path} debe referir a un flag declarado anteriormente: ${operand}.`);
  }
}

function requiredObject(value, path) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} debe ser un objeto.`);
  }
  return value;
}
