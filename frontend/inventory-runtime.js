export function giveInventoryItem(gameState, itemId) {
  if (!gameState.inventory.includes(itemId)) {
    gameState.inventory.push(itemId);
  }
}

export function takeInventoryItem(gameState, itemId) {
  const index = gameState.inventory.indexOf(itemId);
  if (index !== -1) {
    gameState.inventory.splice(index, 1);
  }
}

export function validSelectedInventoryItem(selectedItemId, inventory) {
  return selectedItemId !== null && inventory.includes(selectedItemId)
    ? selectedItemId
    : null;
}
