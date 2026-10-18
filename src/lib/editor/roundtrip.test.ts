// @vitest-environment happy-dom
import { readdirSync, readFileSync } from 'node:fs';
import { Crepe } from '@milkdown/crepe';
import { expect, it } from 'vitest';
import { patchMarkdown, splitFrontmatter } from '../core/markdown.ts';
import { crepeFeatures } from './config.ts';

// The production save path for an unedited document: disk body → editor → patchMarkdown → disk.
for (const name of readdirSync('tests/fixtures')) {
	it(`keeps ${name} byte for byte through the editor`, async () => {
		const { body } = splitFrontmatter(readFileSync(`tests/fixtures/${name}`, 'utf8'));
		const crepe = new Crepe({
			root: document.createElement('div'),
			defaultValue: body.replace(/\r\n/g, '\n'),
			features: crepeFeatures
		});
		await crepe.create();
		const out = crepe.getMarkdown();
		crepe.destroy();
		expect(patchMarkdown(body, out)).toBe(body);
	});
}
