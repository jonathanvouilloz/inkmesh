// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { Crepe, type CrepeConfig } from '@milkdown/crepe';
import { expect, it } from 'vitest';

const body = readFileSync('tests/fixtures/kitchen-sink.md', 'utf8').replace(/^---\n[\s\S]*?\n---\n/, '');
const image = '![Workspace tree after indexing](./assets/tree.png)';

async function roundTrip(features?: CrepeConfig['features']) {
	const crepe = new Crepe({ root: document.createElement('div'), defaultValue: body, features });
	await crepe.create();
	try {
		return crepe.getMarkdown();
	} finally {
		crepe.destroy();
	}
}

it('keeps image alt text with ImageBlock disabled', async () => {
	expect(await roundTrip({ [Crepe.Feature.ImageBlock]: false })).toContain(image);
});

// Pins the current loss: if a Crepe upgrade fixes alt text, this fails on purpose so we notice.
it('loses image alt text with default features (ImageBlock writes the ratio there)', async () => {
	const out = await roundTrip();
	expect(out).not.toContain(image);
	expect(out).toContain('](./assets/tree.png)');
});
