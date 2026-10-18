import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import { unified } from 'unified';

/** The one Markdown configuration, shared by the server and the editor. */
export const processor = unified()
	.use(remarkParse)
	.use(remarkGfm)
	.use(remarkFrontmatter, ['yaml'])
	.use(remarkStringify, { bullet: '-', emphasis: '*', strong: '*', fences: true, rule: '-' });

const FRONTMATTER = /^---\r?\n(?:[\s\S]*?\r?\n)?---(?:\r?\n|$)/;

export function splitFrontmatter(source: string): { frontmatter: string; body: string } {
	const frontmatter = FRONTMATTER.exec(source)?.[0] ?? '';
	return { frontmatter, body: source.slice(frontmatter.length) };
}

// shortcut: no YAML parser, nested values are shown as their raw line; upgrade when filtering by frontmatter lands (milestone 3)
export function frontmatterEntries(frontmatter: string): Array<[string, string]> {
	const entries: Array<[string, string]> = [];
	for (const line of frontmatter.split(/\r?\n/)) {
		const match = /^([^\s#:-][^:]*):(.*)$/.exec(line);
		if (match) entries.push([match[1].trim(), match[2].trim()]);
	}
	return entries;
}

type Block = { start: number; end: number; key: string };

function blocks(text: string): Block[] {
	return processor.parse(text).children.map((node) => ({
		start: node.position!.start.offset!,
		end: node.position!.end.offset!,
		key: String(processor.stringify({ type: 'root', children: [node] }))
	}));
}

/**
 * Rewrites `edited` so that every top-level block whose normalised form is
 * unchanged keeps its original bytes. Blocks are paired by an LCS on their
 * normalised form; an edited block that directly follows a dropped original
 * block takes that block's slot. Between two pieces in consecutive original
 * slots the original gap is kept, elsewhere a blank line. The original's
 * leading text and tail (trailing newline or none) are kept. If keeping a gap
 * would change how the result parses (a single newline joining two blocks),
 * the patch falls back to blank lines everywhere, then to `edited` itself.
 */
export function patchMarkdown(original: string, edited: string): string {
	// shortcut: line endings follow the original as a whole, mixed-ending files get all CRLF; upgrade if such files show up
	const crlf = original.includes('\r\n');
	const a = crlf ? original.replaceAll('\r\n', '\n') : original;
	const b = crlf ? edited.replaceAll('\r\n', '\n') : edited;
	const out = (text: string) => (crlf ? text.replaceAll('\n', '\r\n') : text);
	const A = blocks(a);
	const B = blocks(b);
	if (A.length === 0) return out(b);

	// shortcut: quadratic LCS over top-level blocks, fine below a few thousand blocks; upgrade to a diff library if a document ever exceeds that
	const lcs = Array.from({ length: A.length + 1 }, () => new Array<number>(B.length + 1).fill(0));
	for (let i = A.length - 1; i >= 0; i--)
		for (let j = B.length - 1; j >= 0; j--)
			lcs[i][j] =
				A[i].key === B[j].key ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);

	// Each piece is a source slice and its slot in the original, -1 for none.
	const pieces: Array<{ text: string; slot: number }> = [];
	let dropped = -1;
	for (let i = 0, j = 0; j < B.length; ) {
		if (i < A.length && A[i].key === B[j].key) {
			pieces.push({ text: a.slice(A[i].start, A[i].end), slot: i++ });
			j++;
			dropped = -1;
		} else if (i < A.length && lcs[i + 1][j] >= lcs[i][j + 1]) {
			dropped = i++;
		} else {
			pieces.push({ text: b.slice(B[j].start, B[j].end), slot: dropped });
			j++;
			dropped = -1;
		}
	}

	const keys = B.map((block) => block.key).join('\0');
	for (const keepGaps of [true, false]) {
		let text = a.slice(0, A[0].start);
		pieces.forEach((piece, k) => {
			const prev = pieces[k - 1];
			if (prev)
				text +=
					keepGaps && prev.slot >= 0 && piece.slot === prev.slot + 1
						? a.slice(A[prev.slot].end, A[piece.slot].start)
						: '\n\n';
			text += piece.text;
		});
		text += a.slice(A[A.length - 1].end);
		if (blocks(text).map((block) => block.key).join('\0') === keys) return out(text);
	}
	return out(b);
}
