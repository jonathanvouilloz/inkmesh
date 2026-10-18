import { expect, it } from 'vitest';
import { safeNext } from './redirect.ts';

it('ignores an off-origin next', () => {
	expect(safeNext('/demo/a.md?x=1')).toBe('/demo/a.md?x=1');
	for (const bad of ['//evil.com', '/\\evil.com', 'https://evil.com', 'demo', '', null]) expect(safeNext(bad)).toBe('/');
});
