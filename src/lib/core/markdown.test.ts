import fs from 'node:fs';
import { structuredPatch } from 'diff';
import { describe, expect, it } from 'vitest';
import { frontmatterEntries, patchMarkdown, processor, splitFrontmatter } from './markdown.ts';

const fixture = (name: string) => fs.readFileSync(`tests/fixtures/${name}`, 'utf8');
const fixtures = ['prd.md', 'architecture.md', 'kitchen-sink.md', 'kitchen-sink-crlf.md'];

describe('splitFrontmatter', () => {
	it('reassembles kitchen-sink byte for byte', () => {
		const source = fixture('kitchen-sink.md');
		const { frontmatter, body } = splitFrontmatter(source);
		expect(frontmatter.startsWith('---\ntitle:')).toBe(true);
		expect(frontmatter.endsWith('---\n')).toBe(true);
		expect(frontmatter + body).toBe(source);
	});

	it('handles CRLF fences', () => {
		const source = fixture('kitchen-sink-crlf.md');
		const { frontmatter, body } = splitFrontmatter(source);
		expect(frontmatter.endsWith('---\r\n')).toBe(true);
		expect(frontmatter + body).toBe(source);
	});

	it('returns an empty frontmatter when there is none', () => {
		const source = fixture('prd.md');
		expect(splitFrontmatter(source)).toEqual({ frontmatter: '', body: source });
	});

	it('returns an empty body for a file that is only frontmatter', () => {
		expect(splitFrontmatter('---\ntitle: Q3\n---\n')).toEqual({
			frontmatter: '---\ntitle: Q3\n---\n',
			body: ''
		});
	});
});

describe('frontmatterEntries', () => {
	it('lists top-level key/value lines in order', () => {
		expect(frontmatterEntries('---\ntitle: Q3\ntags: [a, b]\n---\n')).toEqual([
			['title', 'Q3'],
			['tags', '[a, b]']
		]);
	});
});

describe('patchMarkdown', () => {
	for (const name of fixtures) {
		it(`is the identity on ${name}`, () => {
			const x = fixture(name);
			expect(patchMarkdown(x, x)).toBe(x);
		});

		it(`ignores a normalising serializer on ${name}`, () => {
			const x = fixture(name);
			const normalised = String(processor.stringify(processor.parse(x)));
			expect(normalised).not.toBe(x);
			expect(patchMarkdown(x, normalised)).toBe(x);
		});

		it(`changes only the edited paragraph on ${name}`, () => {
			const x = fixture(name);
			const paragraph = processor.parse(x).children.find((node) => node.type === 'paragraph')!;
			const old = x.slice(paragraph.position!.start.offset, paragraph.position!.end.offset);
			const expected = x.replace(old, 'A rewritten paragraph.');
			const edited = String(processor.stringify(processor.parse(expected)));

			const result = patchMarkdown(x, edited);
			expect(result).toBe(expected);
			const hunks = structuredPatch('a', 'b', x, result, '', '', { context: 0 }).hunks;
			expect(hunks).toHaveLength(1);
		});
	}

	it('keeps an appended block separate from the last original block', () => {
		expect(patchMarkdown('One.\n', 'One.\n\nTwo.\n')).toBe('One.\n\nTwo.\n');
	});

	it('keeps the edited text when the original is empty', () => {
		expect(patchMarkdown('', 'Hello.\n')).toBe('Hello.\n');
	});

	it('returns the edited text in CRLF when the original uses CRLF', () => {
		expect(patchMarkdown('# A\r\n\r\nOne.\r\n', '# A\n\nTwo.\n')).toBe('# A\r\n\r\nTwo.\r\n');
	});
});

describe('patchMarkdown safety', () => {
	it('adds a blank line when a kept single newline would merge two blocks', () => {
		expect(patchMarkdown('Para.\n- item\n', 'Para.\n\nNew para.\n')).toBe('Para.\n\nNew para.\n');
	});

	it('keeps an edited block that follows a deleted one', () => {
		expect(patchMarkdown('A.\n\nB.\n\nC.\n', 'A.\n\nD.\n')).toBe('A.\n\nD.\n');
	});
});
