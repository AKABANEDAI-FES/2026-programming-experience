import assert from 'node:assert/strict';
import test from 'node:test';
import { isWorkspaceEmpty } from '../../src/lib/blockly/workspaceState.ts';

test('returns true when the workspace has no blocks', () => {
  assert.equal(isWorkspaceEmpty([]), true);
});

test('returns false when the workspace contains any blocks', () => {
  assert.equal(isWorkspaceEmpty(['repeat', 'nested move']), false);
});
