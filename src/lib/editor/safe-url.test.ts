// @vitest-environment happy-dom
import { Crepe } from '@milkdown/crepe';
import { expect, it } from 'vitest';
import { crepeFeatures, inertUnsafeUrls, prefixHeadingIds, safeUrl } from './config.ts';

it.each([
	['javascript:alert(1)', false],
	[' JaVaScRiPt:x', false],
	['java\tscript:x', false],
	['data:text/html,x', false],
	['vbscript:x', false],
	['https://a', true],
	['/x', true],
	['notes/a.md', true],
	['#h', true],
	['mailto:a@b.c', true]
])('safeUrl(%j) is %s', (url, safe) => {
	expect(safeUrl(url)).toBe(safe);
});

it('renders unsafe links and images inert and leaves the Markdown alone', async () => {
	const source = '[x](javascript:x) [ok](https://a)\n\n![i](data:text/html,x) ![ok](/x.png)\n';
	const root = document.createElement('div');
	const crepe = new Crepe({ root, defaultValue: source, features: crepeFeatures });
	inertUnsafeUrls(crepe);
	await crepe.create();
	try {
		const links = root.querySelectorAll('.ProseMirror a');
		expect([...links].map((a) => a.getAttribute('href'))).toEqual([null, 'https://a']);
		const images = root.querySelectorAll('.ProseMirror img:not(.ProseMirror-separator)');
		expect([...images].map((img) => img.getAttribute('src'))).toEqual([null, '/x.png']);
		expect(crepe.getMarkdown()).toBe(source);
	} finally {
		crepe.destroy();
	}
});

it('prefixes heading ids so a heading never takes an id of the page', async () => {
	const source = '# Comments\n';
	const root = document.createElement('div');
	const crepe = new Crepe({ root, defaultValue: source, features: crepeFeatures });
	prefixHeadingIds(crepe);
	await crepe.create();
	try {
		expect(root.querySelector('.ProseMirror h1')!.id).toBe('user-content-comments');
		expect(crepe.getMarkdown()).toBe(source);
	} finally {
		crepe.destroy();
	}
});
