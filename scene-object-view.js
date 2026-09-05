import { sceneObjectActionIsAvailable } from "./scene-object-action-availability.js";

export function renderNearbyObjects(
  panel,
  container,
  availableObjects,
  selectedObjectId,
  onSelect,
  options = {},
) {
  const buttons = availableObjects.map((sceneObject) => {
    const button = container.ownerDocument.createElement("button");
    button.type = "button";
    button.className = "nearby-object";
    button.textContent = sceneObject.name;
    button.dataset.objectId = sceneObject.id;
    button.setAttribute("aria-pressed", String(sceneObject.id === selectedObjectId));
    button.addEventListener("click", (event) => {
      event?.stopPropagation?.();
      onSelect(sceneObject.id);
    });
    return button;
  });
  container.replaceChildren(...buttons);
  panel.hidden = availableObjects.length === 0;
  renderSelectedObjectActions(
    options.actionsContainer,
    availableObjects,
    selectedObjectId,
    options.onAction,
    options.actionsDisabled === true,
    options.gameState,
  );
}

function renderSelectedObjectActions(
  container,
  availableObjects,
  selectedObjectId,
  onAction,
  disabled,
  gameState,
) {
  if (container === undefined) {
    return;
  }
  const selectedObject = availableObjects.find(
    (sceneObject) => sceneObject.id === selectedObjectId,
  );
  const buttons = (selectedObject?.actions ?? [])
    .filter((action) => sceneObjectActionIsAvailable(action, gameState))
    .map((action) => {
      const button = container.ownerDocument.createElement("button");
      button.type = "button";
      button.className = "nearby-object-action";
      button.textContent = action.label;
      button.dataset.objectId = selectedObject.id;
      button.dataset.actionId = action.id;
      button.disabled = disabled;
      button.addEventListener("click", (event) => {
        event?.stopPropagation?.();
        if (!button.disabled) {
          onAction?.(selectedObject.id, action.id);
        }
      });
      return button;
    });
  container.replaceChildren(...buttons);
  container.hidden = buttons.length === 0;
}
