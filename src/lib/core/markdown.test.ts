import fs from 'node:fs';
import { structuredPatch } from 'diff';
import { describe, expect, it } from 'vitest';
import {
	frontmatterEntries,
	imageUrls,
	patchMarkdown,
	processor,
	renderHtml,
	rewriteUrls,
	splitFrontmatter
} from './markdown.ts';

const fixture = (name: string) => fs.readFileSync(`tests/fixtures/${name}`, 'utf8');
const fixtures = ['prd.md', 'architecture.md', 'kitchen-sink.md', 'kitchen-sink-crlf.md', 'reference-links.md'];

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

	it('keeps reference links and their definitions when the editor inlines them', () => {
		const x = fixture('reference-links.md');
		// What Crepe emits after an edit to the last paragraph: inline links, no definitions.
		const edited = [
			'# Reference links',
			'See [the spec](https://example.com/spec "The spec") and the [roadmap](https://example.com/roadmap) before the review.',
			'![The logo](https://example.com/logo.png)',
			'An edited paragraph.\n'
		].join('\n\n');
		expect(patchMarkdown(x, edited)).toBe(x.replace('A paragraph without links.', 'An edited paragraph.'));
	});

	it('keeps a later untouched block when the block before a definition is deleted', () => {
		const x = 'Para.\n\nGone.\n\n[a]: https://a\n\nKeep _this_ one.\n';
		expect(patchMarkdown(x, 'Para.\n\nKeep *this* one.\n')).toBe(
			'Para.\n\n[a]: https://a\n\nKeep _this_ one.\n'
		);
		const setext = 'Para.\n\nGone.\n\n[a]: https://a\n\nTitle\n=====\n';
		expect(patchMarkdown(setext, 'Para.\n\n# Title\n')).toBe(
			'Para.\n\n[a]: https://a\n\nTitle\n=====\n'
		);
	});

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

describe('patchMarkdown local fallback', () => {
	it('keeps a tight gap elsewhere when a kept gap would merge blocks', () => {
		expect(patchMarkdown('# H\nUpdated: x\n\nPara.\n- item\n', '# H\n\nUpdated: x\n\nPara.\n\nNew para.\n')).toBe(
			'# H\nUpdated: x\n\nPara.\n\nNew para.\n'
		);
	});

	it('takes the edited slice of a kept list that would merge with a new adjacent list', () => {
		expect(patchMarkdown('# H\nUpdated: x\n\n* a\n\nPara.\n', '# H\n\nUpdated: x\n\n- a\n\n* b\n')).toBe(
			'# H\nUpdated: x\n\n- a\n\n* b\n'
		);
	});
});

describe('rewriteUrls', () => {
	const up = (url: string) => (url.startsWith('#') || url.includes(':') ? null : `new/${url}`);

	it('changes only the URL characters', () => {
		const source = [
			'---',
			'link: "[f](f.md)"',
			'---',
			'See [a](b.md "t") and ![i](img/x.png).',
			'',
			'| col | [c](c.md) |',
			'| --- | --- |',
			'',
			'- item [d]( d.md )',
			'',
			'[r]: <dir/my file.md> "title"',
			'[e]: e.md',
			'[h](#x) [m](mailto:a@b.c) [w](https://x/a.md)',
			''
		].join('\n');
		expect(rewriteUrls(source, up)).toBe(
			source
				.replace('(b.md', '(new/b.md')
				.replace('(img/', '(new/img/')
				.replace('(c.md', '(new/c.md')
				.replace('( d.md', '( new/d.md')
				.replace('<dir/', '<new/dir/')
				.replace(': e.md', ': new/e.md')
		);
	});

	it('keeps CRLF and frontmatter', () => {
		const source = '---\r\ntitle: "[f](f.md)"\r\n---\r\n# H\r\n\r\nSee [a](b.md "t")\r\n\r\n[r]: <c d.md>\r\n';
		expect(rewriteUrls(source, up)).toBe(
			source.replace('(b.md', '(new/b.md').replace('<c d', '<new/c d')
		);
	});

	it('returns the identical string when nothing changes', () => {
		const source = 'A [ref][r] and [b](b.md).\n\n[r]: r.md\n';
		expect(rewriteUrls(source, () => null)).toBe(source);
		expect(rewriteUrls(source, (u) => u)).toBe(source);
	});

	it('finds the URL after an image alt or link text that repeats it', () => {
		expect(rewriteUrls('![x.png](x.png) [b.md](b.md "b.md")\n', up)).toBe(
			'![x.png](new/x.png) [b.md](new/b.md "b.md")\n'
		);
	});
});

describe('renderHtml', () => {
	it('renderHtml never emits active content', () => {
		const inputs = [
			'<script>alert(1)</script>',
			'a <img src=x onerror=alert(1)> b',
			'[x](javascript:alert(1))',
			'[x](JaVaScRiPt:alert(1))',
			'<javascript:alert(1)>',
			'[x][r]\n\n[r]: javascript:alert(1)',
			'![x](data:image/svg+xml;base64,PHN2Zz4=)',
			'[x](vbscript:msgbox)'
		];
		for (const input of inputs) {
			const html = renderHtml(input);
			expect(html, input).not.toMatch(/<script|<iframe|<img src="x" onerror/i);
			// An event-handler attribute inside a tag; text between tags is inert.
			expect(html, input).not.toMatch(/<[^>]*\son[a-z]+\s*=/i);
			for (const [, value] of html.matchAll(/\s(?:href|src)\s*=\s*"([^"]*)"/gi))
				expect(value, input).not.toMatch(/javascript:|vbscript:|data:/i);
		}
		// hast-util-to-html escapes only `<` and `&` in text, so `&lt;script&gt;` reads `&#x3C;script>`.
		expect(renderHtml('<script>alert(1)</script>')).toContain('<pre><code>&#x3C;script>');
	});

	it('renders the documents people write', () => {
		const html = renderHtml(
			'---\ntitle: Secret\n---\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n- [ ] todo\n\n[b](b.md) ![p](img/p.png) https://example.com\n'
		);
		expect(html).toContain('<table>');
		expect(html).toContain('<input type="checkbox" disabled');
		expect(html).toContain('href="b.md"');
		expect(html).toContain('src="img/p.png"');
		expect(html).toContain('href="https://example.com"');
		expect(html).not.toContain('Secret');
	});

	it('imageUrls lists images and definitions', () => {
		expect(imageUrls('![a](x.png) [l](y.md)\n\n[d]: z.png')).toEqual(['x.png', 'z.png']);
	});
});
