import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const screenSource = readFileSync(
  new URL('../../src/components/ProgrammingScreen.tsx', import.meta.url),
  'utf8',
);
const stylesSource = readFileSync(
  new URL('../../src/components/ProgrammingScreen.module.css', import.meta.url),
  'utf8',
);

test('places the instruction inside its own dotted rectangle', () => {
  assert.match(
    screenSource,
    /<span className=\{styles\.workspaceGuideLabel\}>\s*ここに ブロックを おいてね\s*<\/span>/,
  );
  assert.match(stylesSource, /\.workspaceGuideLabel\s*\{[^}]*border:\s*[^;]*dotted/s);
});
