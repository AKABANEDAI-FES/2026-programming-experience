import assert from 'node:assert/strict';
import test from 'node:test';
import { installKioskSafety } from '../../src/lib/ui/kioskSafety.ts';

function dispatch(target: EventTarget, type: string, properties: object = {}) {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, properties);
  target.dispatchEvent(event);
  return event.defaultPrevented;
}

test('reload, devtools and context menus are blocked; editing remains usable', () => {
  const target = new EventTarget();
  const cleanup = installKioskSafety(target as unknown as Window);
  const base = { ctrlKey: false, metaKey: false, shiftKey: false, altKey: false };
  const blocked = [
    { key: 'F5' },
    { key: 'F5', ctrlKey: true },
    { key: 'r', ctrlKey: true },
    { key: 'R', ctrlKey: true, shiftKey: true },
    { key: 'r', metaKey: true },
    { key: 'F12' },
    ...['I', 'J', 'C', 'K'].map((key) => ({ key, ctrlKey: true, shiftKey: true })),
    { key: 'i', metaKey: true, altKey: true },
    { key: 'ContextMenu' },
    { key: 'F10', shiftKey: true },
  ];
  for (const keys of blocked) {
    assert.equal(dispatch(target, 'keydown', { ...base, ...keys }), true, JSON.stringify(keys));
  }
  for (const keys of [
    { key: 'r' },
    { key: 'あ' },
    { key: 'Process', isComposing: true },
    { key: 'Backspace' },
    { key: 'Delete' },
    { key: 'Tab' },
    { key: 'Enter' },
    { key: 'z', ctrlKey: true },
    { key: 'c', ctrlKey: true },
    { key: 'v', ctrlKey: true },
  ]) {
    assert.equal(dispatch(target, 'keydown', { ...base, ...keys }), false, JSON.stringify(keys));
  }
  assert.equal(dispatch(target, 'contextmenu'), true);
  for (const type of ['pointerdown', 'mousedown']) {
    assert.equal(dispatch(target, type, { button: 2 }), true);
    assert.equal(dispatch(target, type, { button: 0 }), false);
  }
  cleanup();
  assert.equal(dispatch(target, 'contextmenu'), false);
  assert.equal(dispatch(target, 'keydown', { ...base, key: 'F5' }), false);
  assert.equal(dispatch(target, 'pointerdown', { button: 2 }), false);
  assert.equal(dispatch(target, 'mousedown', { button: 2 }), false);
});

test('cleanup and remount do not leave duplicate listeners', () => {
  const target = new EventTarget();
  installKioskSafety(target as unknown as Window)();
  const cleanup = installKioskSafety(target as unknown as Window);
  assert.equal(dispatch(target, 'contextmenu'), true);
  cleanup();
  assert.equal(dispatch(target, 'contextmenu'), false);
});
