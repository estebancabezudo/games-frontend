const TALKING_BASE_MS = 300;
const TALKING_CHARACTER_MS = 45;
const TALKING_MINIMUM_MS = 600;
const TALKING_MAXIMUM_MS = 5000;

export function calculateTalkingDuration(text) {
  const characterCount = typeof text === "string" ? text.trim().length : 0;
  return clamp(
    TALKING_BASE_MS + characterCount * TALKING_CHARACTER_MS,
    TALKING_MINIMUM_MS,
    TALKING_MAXIMUM_MS,
  );
}

export function createDialogueTalkingRuntime(timer = defaultTimer()) {
  return {
    timer,
    timerId: null,
    generation: 0,
    speakerId: null,
    talking: false,
  };
}

export function startDialogueTalking(runtime, speakerId, text, onFinished) {
  cancelDialogueTalking(runtime);
  const generation = runtime.generation;
  const durationMs = calculateTalkingDuration(text);
  runtime.speakerId = speakerId;
  runtime.talking = true;
  runtime.timerId = runtime.timer.set(() => {
    if (runtime.generation !== generation || runtime.speakerId !== speakerId) {
      return;
    }
    runtime.timerId = null;
    runtime.talking = false;
    runtime.speakerId = null;
    onFinished(speakerId);
  }, durationMs);
  return durationMs;
}

export function cancelDialogueTalking(runtime) {
  if (runtime.timerId !== null) {
    runtime.timer.clear(runtime.timerId);
  }
  runtime.timerId = null;
  runtime.generation += 1;
  runtime.speakerId = null;
  runtime.talking = false;
}

function defaultTimer() {
  return {
    set: (callback, durationMs) => setTimeout(callback, durationMs),
    clear: (timerId) => clearTimeout(timerId),
  };
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}
