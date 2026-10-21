import assert from 'node:assert/strict';
import test from 'node:test';
import {
  preventKioskShortcuts,
  preventRightClickMenu,
} from '../../src/lib/ui/participantSafety.ts';

function createEvent<T extends object>(properties: T) {
  let defaultPrevented = false;
  const event = {
    ...properties,
    preventDefault() {
      defaultPrevented = true;
    },
  };

  return { event, wasDefaultPrevented: () => defaultPrevented };
}

test('右クリックのコンテキストメニューを抑止する', () => {
  const { event, wasDefaultPrevented } = createEvent({ button: 2 });

  preventRightClickMenu(event as MouseEvent);

  assert.equal(wasDefaultPrevented(), true);
});

test('右クリック以外のコンテキストメニューは抑止しない', () => {
  const { event, wasDefaultPrevented } = createEvent({ button: 0 });

  preventRightClickMenu(event as MouseEvent);

  assert.equal(wasDefaultPrevented(), false);
});

test('F5とF12を抑止する', () => {
  for (const key of ['F5', 'F12']) {
    const { event, wasDefaultPrevented } = createEvent({ key });

    preventKioskShortcuts(event as KeyboardEvent);

    assert.equal(wasDefaultPrevented(), true, `${key} should be prevented`);
  }
});

test('F5とF12以外のキーは抑止しない', () => {
  const { event, wasDefaultPrevented } = createEvent({ key: 'a' });

  preventKioskShortcuts(event as KeyboardEvent);

  assert.equal(wasDefaultPrevented(), false);
});
