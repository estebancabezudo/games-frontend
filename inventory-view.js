export function renderInventory(
  container,
  inventory,
  selectedItemId,
  onSelect,
) {
  const buttons = inventory.map((itemId) => {
    const button = container.ownerDocument.createElement("button");
    button.type = "button";
    button.className = "inventory-item";
    button.textContent = itemId;
    button.setAttribute("aria-pressed", String(itemId === selectedItemId));
    button.addEventListener("click", () => onSelect(itemId));
    return button;
  });
  container.replaceChildren(...buttons);
}
