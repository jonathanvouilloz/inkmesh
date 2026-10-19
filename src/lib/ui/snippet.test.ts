import { expect, it } from 'vitest';
import { snippetParts } from './snippet.ts';

it('splits a snippet into text and marked parts', () => {
	expect(snippetParts('a \u0002b\u0003 c')).toEqual([
		{ text: 'a ', mark: false },
		{ text: 'b', mark: true },
		{ text: ' c', mark: false }
	]);
});

it('drops an unmatched marker', () => {
	expect(snippetParts('a\u0003 b')).toEqual([{ text: 'a b', mark: false }]);
	// A document may contain the markers itself: only a balanced pair marks.
	expect(snippetParts('x \u0002y \u0002z\u0003')).toEqual([
		{ text: 'x y ', mark: false },
		{ text: 'z', mark: true }
	]);
});
