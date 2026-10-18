// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { createTwoFilesPatch } from 'diff';
import { Crepe } from '@milkdown/crepe';
import { describe, expect, it } from 'vitest';

const fixtures = ['prd.md', 'architecture.md', 'kitchen-sink.md', 'kitchen-sink-crlf.md'];

// Normalisation exactly as the spike brief defines it; nothing more.
function normalize(md: string): string {
	return md
		.replace(/[ \t]+$/gm, '') // trailing spaces
		.replace(/\n{3,}/g, '\n\n') // runs of blank lines
		.replace(/^(\s*)\*(?= )/gm, '$1-') // `*` list markers
		.replace(/__(?=\S)(.+?)__/g, '**$1**') // `__` strong
		.replace(/(?<![\w_*])_(?=\S)([^_\n]+?)_(?![\w_])/g, '*$1*') // `_` emphasis
		.replace(/^\|?(?: *:?-+:? *\|)+(?: *:?-+:? *)?$/gm, (row) => row.replace(/-+/g, '-')) // table alignment dashes
		.trim();
}

describe('Crepe round-trip spike', () => {
	for (const name of fixtures) {
		it(name, async () => {
			const raw = readFileSync(`tests/fixtures/${name}`, 'utf8');
			const body = raw.replace(/^---\n[\s\S]*?\n---\n/, '');
			const crepe = new Crepe({ root: document.createElement('div'), defaultValue: body });
			await crepe.create();
			const out = crepe.getMarkdown();
			crepe.destroy();
			console.log(createTwoFilesPatch(`${name} (body)`, `${name} (crepe)`, body, out));
			console.log(createTwoFilesPatch(`${name} (normalized body)`, `${name} (normalized crepe)`, normalize(body), normalize(out)));
			expect(normalize(out)).toBe(normalize(body));
		});
	}
});
