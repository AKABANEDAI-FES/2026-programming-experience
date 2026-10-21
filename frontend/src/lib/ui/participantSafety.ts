export function preventRightClickMenu(event: MouseEvent): void {
  if (event.button === 2) {
    event.preventDefault();
  }
}

export function preventKioskShortcuts(event: KeyboardEvent): void {
  if (event.key === 'F5' || event.key === 'F12') {
    event.preventDefault();
  }
}
