/**
 * 受付・制作画面の誤操作を抑止する。OSやブラウザのメニューからの操作は対象外。
 * captureでBlocklyより先に処理し、独自の右クリックメニューも開かせない。
 */
export function installKioskSafety(target: Window): () => void {
  const blockEvent = (event: Event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  const handleMouseDown = (event: MouseEvent) => {
    if (event.button === 2) {
      blockEvent(event);
    }
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    const key = event.key.toLowerCase();
    const modifier = event.ctrlKey || event.metaKey;
    const reload = key === 'f5' || (modifier && key === 'r');
    const devTools =
      key === 'f12' ||
      (event.ctrlKey && event.shiftKey && ['i', 'j', 'c', 'k'].includes(key)) ||
      (event.metaKey && event.altKey && ['i', 'j', 'c', 'k'].includes(key));
    const contextMenu = key === 'contextmenu' || (event.shiftKey && key === 'f10');

    if (reload || devTools || contextMenu) {
      blockEvent(event);
    }
  };

  target.addEventListener('contextmenu', blockEvent, { capture: true });
  target.addEventListener('pointerdown', handleMouseDown, { capture: true });
  target.addEventListener('mousedown', handleMouseDown, { capture: true });
  target.addEventListener('keydown', handleKeyDown, { capture: true });

  return () => {
    target.removeEventListener('contextmenu', blockEvent, { capture: true });
    target.removeEventListener('pointerdown', handleMouseDown, { capture: true });
    target.removeEventListener('mousedown', handleMouseDown, { capture: true });
    target.removeEventListener('keydown', handleKeyDown, { capture: true });
  };
}
