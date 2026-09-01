export function createSceneObjectHoverController(output) {
  let pointerObject = null;
  let focusedObject = null;

  function refresh() {
    const sceneObject = focusedObject ?? pointerObject;
    output.textContent = sceneObject === null ? "" : `Objeto: ${sceneObject.name}`;
    output.hidden = sceneObject === null;
  }

  return {
    bind(node, sceneObject, isAvailable = () => true) {
      node.addEventListener("pointerenter", () => {
        if (!isAvailable()) return;
        pointerObject = sceneObject;
        refresh();
      });
      node.addEventListener("pointerleave", () => {
        if (pointerObject?.id === sceneObject.id) pointerObject = null;
        refresh();
      });
      node.addEventListener("focus", () => {
        if (!isAvailable()) return;
        focusedObject = sceneObject;
        refresh();
      });
      node.addEventListener("blur", () => {
        if (focusedObject?.id === sceneObject.id) focusedObject = null;
        refresh();
      });
    },
    clear() {
      pointerObject = null;
      focusedObject = null;
      refresh();
    },
    currentObjectId() {
      return (focusedObject ?? pointerObject)?.id ?? null;
    },
  };
}
