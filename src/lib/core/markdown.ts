import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import remarkStringify from 'remark-stringify';
import { unified } from 'unified';

const parser = unified().use(remarkParse).use(remarkGfm).use(remarkFrontmatter, ['yaml']);

/** The one Markdown configuration, shared by the server and the editor. */
export const processor = parser().use(remarkStringify, {
	bullet: '-',
	emphasis: '*',
	strong: '*',
	fences: true,
	rule: '-'
});

const FRONTMATTER = /^---\r?\n(?:[\s\S]*?\r?\n)?---(?:\r?\n|$)/;

export function splitFrontmatter(source: string): { frontmatter: string; body: string } {
	const frontmatter = FRONTMATTER.exec(source)?.[0] ?? '';
	return { frontmatter, body: source.slice(frontmatter.length) };
}

const KEY = /^([^\s#:-][^:]*):(.*)$/;

// shortcut: no YAML parser, indented (nested) lines are skipped and their parent key gets its raw rest of line; frontmatterFields reads values for sorting and filtering, upgrade both if real YAML is needed
export function frontmatterEntries(frontmatter: string): Array<[string, string]> {
	const entries: Array<[string, string]> = [];
	for (const line of frontmatter.split(/\r?\n/)) {
		const match = KEY.exec(line);
		if (match) entries.push([match[1].trim(), match[2].trim()]);
	}
	return entries;
}

export type Fields = Record<string, string[]>;

const unquote = (value: string) => /^(["'])(.*)\1$/s.exec(value)?.[2] ?? value;

/**
 * Each top-level key's values: `[a, "b c"]` and indented `- item` lines under an empty key are lists,
 * matching quotes are dropped, empty values give no entry, the first occurrence of a key wins.
 */
// shortcut: anchors, multi-line strings, nested maps and commas inside quoted list items are not understood; upgrade to a YAML parser if users need them
export function frontmatterFields(frontmatter: string): Fields {
	const fields = new Map<string, string[]>();
	let list: string[] | null = null;
	for (const line of frontmatter.split(/\r?\n/)) {
		const item = /^\s+-(?:\s+(.*))?$/.exec(line);
		if (list && item) {
			list.push(unquote((item[1] ?? '').trim()));
			continue;
		}
		list = null;
		const match = KEY.exec(line);
		const key = match?.[1].trim();
		if (!match || !key || fields.has(key)) continue;
		const value = match[2].trim();
		const values = !value
			? (list = [])
			: /^\[.*\]$/.test(value)
				? value.slice(1, -1).split(',').map((v) => unquote(v.trim()))
				: [unquote(value)];
		fields.set(key, values);
	}
	// A Map, then fromEntries: a key such as `__proto__` stays a plain own property.
	return Object.fromEntries(
		[...fields].map(([key, values]) => [key, values.filter(Boolean)]).filter(([, values]) => values.length)
	);
}

type Block = { start: number; end: number; key: string; definition: boolean };
type Node = { type: string; identifier?: string; children?: Node[]; [key: string]: unknown };

const walk = (node: Node, fn: (node: Node) => void) => {
	fn(node);
	node.children?.forEach((child) => walk(child, fn));
};

function blocks(text: string): Block[] {
	const tree = processor.parse(text);
	const root = tree as unknown as Node; // walked loosely: only type, identifier and children matter
	// The editor writes reference links inline and drops their definitions, so keys compare them
	// resolved: `[x][s]` with `[s]: url` keys as `[x](url)` and keeps its original bytes.
	const defs = new Map<string, Node>();
	walk(root, (n) => {
		if (n.type === 'definition' && !defs.has(n.identifier!)) defs.set(n.identifier!, n);
	});
	walk(root, (n) => {
		if (!n.children) return;
		n.children = n.children.map((c) => {
			const ref = c.type === 'linkReference' || c.type === 'imageReference';
			const def = ref ? defs.get(c.identifier!) : undefined;
			if (!def) return c;
			const { type, identifier, label, referenceType, position, ...rest } = c;
			const inline = type === 'linkReference' ? 'link' : 'image';
			return { ...rest, type: inline, url: def.url, title: def.title };
		});
	});
	return tree.children.map((node) => ({
		start: node.position!.start.offset!,
		end: node.position!.end.offset!,
		key: String(processor.stringify({ type: 'root', children: [node] })),
		definition: node.type === 'definition'
	}));
}

const PHRASING = new Set([
	'paragraph',
	'heading',
	'tableCell',
	'emphasis',
	'strong',
	'delete',
	'link',
	'linkReference'
]);

// Raw HTML shows as its source, like in the editor: it never reaches the output as HTML.
const htmlAsCode = () => (tree: unknown) =>
	walk(tree as Node, (n) => {
		for (const child of n.children ?? [])
			if (child.type === 'html') child.type = PHRASING.has(n.type) ? 'inlineCode' : 'code';
	});

const renderer = parser()
	.use(htmlAsCode)
	.use(remarkRehype)
	// remark-rehype already prefixes footnote ids with user-content-; a second prefix would break their links.
	.use(rehypeSanitize, { ...defaultSchema, clobberPrefix: '' })
	.use(rehypeStringify);

/** Safe HTML for a Markdown document: no raw HTML, no active URL, no event handler. */
export function renderHtml(source: string): string {
	return String(renderer.processSync(splitFrontmatter(source).body));
}

/** The URLs of the images and link definitions, in document order. */
export function imageUrls(source: string): string[] {
	const urls: string[] = [];
	walk(processor.parse(source) as unknown as Node, (n) => {
		if (n.type === 'image' || n.type === 'definition') urls.push(n.url as string);
	});
	return urls;
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Replaces the URL of every link, image and definition for which `rewrite` returns a new one,
 * changing only the URL's characters (title, brackets and `<…>` form stay).
 */
// shortcut: a URL written with escapes or entities (`a\_b.md`, `&amp;`) differs from its parsed form and is left as is; upgrade by reading micromark tokens if such links show up
export function rewriteUrls(source: string, rewrite: (url: string) => string | null): string {
	// The parser skips a leading BOM, so its offsets would be one short.
	if (source.startsWith('\uFEFF')) return '\uFEFF' + rewriteUrls(source.slice(1), rewrite);
	const edits: Array<[number, number, string]> = [];
	walk(processor.parse(source) as unknown as Node, (n) => {
		if (n.type !== 'link' && n.type !== 'image' && n.type !== 'definition') return;
		const url = n.url as string;
		const next = rewrite(url);
		if (next === null || next === url) return;
		const { start, end } = n.position as { start: { offset: number }; end: { offset: number } };
		// The destination follows `](` (`]:` for a definition), after a link's text so the text cannot hold it.
		const last = n.children?.at(-1)?.position as { end: { offset: number } } | undefined;
		const from = last ? last.end.offset : start.offset;
		const opener = n.type === 'definition' ? ':' : '\\(';
		const destination = new RegExp(`\\]${opener}\\s*<?${escapeRegExp(url)}`);
		const match = destination.exec(source.slice(from, end.offset));
		if (!match) return;
		const at = from + match.index + match[0].length - url.length;
		edits.push([at, at + url.length, next]);
	});
	let out = source;
	for (const [a, b, text] of edits.sort((x, y) => y[0] - x[0]))
		out = out.slice(0, a) + text + out.slice(b);
	return out;
}

/**
 * Rewrites `edited` so that every top-level block whose normalised form is
 * unchanged keeps its original bytes. Blocks are paired by an LCS on their
 * normalised form; an edited block that directly follows a dropped original
 * block takes that block's slot. Between two pieces in consecutive original
 * slots the original gap is kept, elsewhere a blank line. The original's
 * leading text and tail (trailing newline or none) are kept. If the result
 * parses differently from `edited` (a kept gap or bullet joining two blocks),
 * the kept pieces next to a changed one take their edited slices and every
 * changed piece is set off by blank lines; the rest of the document keeps its
 * bytes. Only if that still fails is `edited` returned as is. Original link
 * definitions that `edited` lacks are kept in their place.
 */
// shortcut: top-level-block granularity, editing one list item re-emits the whole list in normalised form; upgrade to nested patching if users complain
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

	// One piece per edited block: its slot in the original (-1 for none) and whether it changed.
	const pieces: Array<{ slot: number; changed: boolean; editedText: string }> = [];
	// Original definitions the edited text lacks stay in place (the editor drops them, see blocks).
	const editedKeys = new Set(B.map((block) => block.key));
	// shortcut: a definition the edited text lacks is never removed, in rich or raw mode; only a raw-mode deletion that leaves references unresolved fails the parse check below and saves the raw text as is; upgrade when users need to delete definitions
	const orphan = (block: Block) => block.definition && !editedKeys.has(block.key);
	let dropped = -1;
	for (let i = 0, j = 0; j < B.length || i < A.length; ) {
		// A changed block that replaces the block just before an orphan takes its slot first, unless it
		// matches a later original block: for an orphan lcs[i][j] === lcs[i + 1][j], so a smaller
		// lcs[i][j + 1] means B[j] pairs further down.
		if (
			i < A.length &&
			orphan(A[i]) &&
			(dropped < 0 || j === B.length || lcs[i][j + 1] < lcs[i][j])
		) {
			pieces.push({ slot: i, changed: false, editedText: a.slice(A[i].start, A[i++].end) });
			dropped = -1;
			continue;
		}
		if (j === B.length) {
			i++;
			continue;
		}
		const editedText = b.slice(B[j].start, B[j].end);
		if (i < A.length && A[i].key === B[j].key) {
			pieces.push({ slot: i++, changed: false, editedText });
			j++;
			dropped = -1;
		} else if (i < A.length && !orphan(A[i]) && lcs[i + 1][j] >= lcs[i][j + 1]) {
			dropped = i++;
		} else {
			pieces.push({ slot: dropped, changed: true, editedText });
			j++;
			dropped = -1;
		}
	}

	const build = (local: boolean) => {
		// Local fallback: kept neighbours of a changed piece count as changed too.
		const changed = pieces.map(
			(p, k) => p.changed || (local && !!(pieces[k - 1]?.changed || pieces[k + 1]?.changed))
		);
		let text = a.slice(0, A[0].start);
		pieces.forEach((piece, k) => {
			const prev = pieces[k - 1];
			if (prev)
				text +=
					!(local && (changed[k] || changed[k - 1])) &&
					prev.slot >= 0 &&
					piece.slot === prev.slot + 1
						? a.slice(A[prev.slot].end, A[piece.slot].start)
						: '\n\n';
			text += changed[k] ? piece.editedText : a.slice(A[piece.slot].start, A[piece.slot].end);
		});
		return text + a.slice(A[A.length - 1].end);
	};

	const keys = B.map((block) => block.key).join('\0');
	for (const local of [false, true]) {
		const text = build(local);
		const kept = blocks(text).filter((block) => !orphan(block));
		if (kept.map((block) => block.key).join('\0') === keys) return out(text);
	}
	return out(b);
}
