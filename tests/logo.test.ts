import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BLADE } from '../src/ui/dom';

describe('logo', () => {
  it('the toolbar icons and the card eye draw the same blade', () => {
    const script = readFileSync(new URL('../scripts/make-icons.mjs', import.meta.url), 'utf8');
    expect(/const BLADE =\s*'([^']+)'/.exec(script)?.[1]).toBe(BLADE);
  });
});
