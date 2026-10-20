import { expect, it } from 'vitest';
import { reroute } from './hooks.ts';

const to = (path: string) => reroute({ url: new URL(`http://localhost${path}`), fetch });

it('reroutes image paths to the raw routes', () => {
	const token = 'a'.repeat(40) + '_-Z';
	expect(to('/demo/notes/a.png')).toBe('/demo/-/raw/notes/a.png');
	expect(to('/demo/a%20b.JPG')).toBe('/demo/-/raw/a%20b.JPG');
	expect(to(`/s/${token}/img/x.webp`)).toBe(`/s/${token}/-/raw/img/x.webp`);
	for (const path of [
		'/demo/a.md',
		'/demo/-/raw/x.png',
		'/api/v1/workspaces/demo/documents/x.png',
		'/demo',
		'/s/short/x.png'
	])
		expect(to(path)).toBeUndefined();
});
