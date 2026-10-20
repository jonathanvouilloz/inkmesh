import { expect, it } from 'vitest';
import type { Fields } from '#lib/core/markdown.ts';
import type { TreeNode } from '#lib/core/documents.ts';
import { canonicalQuery, queryFolder, queryString } from './folderQuery.ts';

const nodes: TreeNode[] = [
	{ name: 'sub', path: 'sub', kind: 'folder', children: [] },
	{ name: 'a.md', path: 'a.md', kind: 'doc', title: 'Alpha', modified: '2026-01-01T00:00:00Z' },
	{ name: 'b.md', path: 'b.md', kind: 'doc', title: 'Beta', modified: '2026-03-01T00:00:00Z' },
	{ name: 'c.md', path: 'c.md', kind: 'doc', title: 'Gamma', modified: '2026-02-01T00:00:00Z' }
];
const fields: Record<string, Fields> = {
	'a.md': { date: ['2026-01-05'], status: ['draft'], tags: ['q3', 'ops'], n: ['10'] },
	'b.md': { date: ['2026-03-01'], status: ['Done'], tags: ['q3'], n: ['9'] },
	'c.md': { date: ['2026-02-10'], status: ['draft'] }
};

const names = (search: string, f = fields) =>
	queryFolder(nodes, f, new URLSearchParams(search)).nodes.map((n) => n.name.replace(/\.md$/, ''));

it("keeps today's order without parameters", () => {
	expect(names('')).toEqual(['sub', 'a', 'b', 'c']);
	const q = queryFolder(nodes, fields, new URLSearchParams());
	expect(q.shown).toBeNull();
	expect(q.documents).toBe(3);
	expect(q.clear).toBe('');
});

it('sorts by a field both ways', () => {
	expect(names('sort=date')).toEqual(['sub', 'a', 'c', 'b']);
	expect(names('sort=date&order=desc')).toEqual(['sub', 'b', 'c', 'a']);
	expect(queryFolder(nodes, fields, new URLSearchParams('sort=date')).shown).toBe('date');
});

it('puts documents without the field last, ties by name', () => {
	expect(names('sort=tags')).toEqual(['sub', 'a', 'b', 'c']);
	// a and b tie on q3: both orders keep them A to Z; c has no tags and stays last.
	expect(names('sort=tags&order=desc')).toEqual(['sub', 'a', 'b', 'c']);
});

it('sorts numbers as numbers', () => {
	expect(names('sort=n')).toEqual(['sub', 'b', 'a', 'c']);
});

it('uses built-ins unless a field shadows them', () => {
	expect(names('sort=title&order=desc')).toEqual(['sub', 'c', 'b', 'a']);
	expect(names('sort=modified')).toEqual(['sub', 'a', 'c', 'b']);
	expect(queryFolder(nodes, fields, new URLSearchParams('sort=title')).shown).toBeNull();
	const shadowed = { ...fields, 'c.md': { ...fields['c.md'], title: ['Aaa'] } };
	expect(names('sort=title', shadowed)).toEqual(['sub', 'c', 'a', 'b']);
	expect(queryFolder(nodes, shadowed, new URLSearchParams('sort=title')).shown).toBe('title');
});

it('filters by equality, case-insensitive, lists by contains', () => {
	expect(names('status=draft')).toEqual(['a', 'c']);
	expect(names('status=done')).toEqual(['b']);
	expect(names('status=%20DONE%20')).toEqual(['b']);
	expect(names('tags=q3')).toEqual(['a', 'b']);
	expect(names('tags=q3&status=draft')).toEqual(['a']);
	const q = queryFolder(nodes, fields, new URLSearchParams('sort=date&order=desc&status=draft'));
	expect(q.filters).toEqual([['status', 'draft']]);
	expect(q.documents).toBe(3);
	expect(q.clear).toBe('?sort=date&order=desc');
});

it('ignores unknown and reserved parameters', () => {
	const q = queryFolder(nodes, fields, new URLSearchParams('colour=red&sort=nope&field=status&value=draft'));
	expect(q.nodes.map((n) => n.name)).toEqual(['sub', 'a.md', 'b.md', 'c.md']);
	expect(q.sort).toBeNull();
	expect(q.filters).toEqual([]);
});

it('caps filters and values', () => {
	expect(queryFolder(nodes, fields, new URLSearchParams('tags=q3&'.repeat(6))).filters).toHaveLength(5);
	const [[, value]] = queryFolder(nodes, fields, new URLSearchParams(`status=${'x'.repeat(201)}`)).filters;
	expect(value).toHaveLength(200);
});

it('lists fields and values', () => {
	const q = queryFolder(nodes, fields, new URLSearchParams());
	expect(q.fields).toEqual(['date', 'n', 'status', 'tags']);
	expect(q.values.status).toEqual(['Done', 'draft'].sort((x, y) => x.localeCompare(y)));
	expect(q.values.tags).toEqual(['ops', 'q3']);
	const many: Record<string, Fields> = {
		'a.md': Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`f${i}`, ['x']])),
		'b.md': { e: Array.from({ length: 60 }, (_, i) => `v${i}`) }
	};
	const capped = queryFolder(nodes, many, new URLSearchParams());
	expect(capped.fields).toHaveLength(30);
	expect(capped.values.e).toHaveLength(50);
});

it('builds the canonical URL', () => {
	const c = (s: string) => canonicalQuery(new URLSearchParams(s));
	expect(c('field=status&value=draft&sort=date')).toBe('?sort=date&status=draft');
	expect(c('field=&value=')).toBe('');
	expect(c('field=sort&value=x')).toBe('');
	expect(c('sort=date')).toBeNull();
	expect(c('status=done&field=status&value=draft')).toBe('?status=draft');
	expect(c('sort=date&order=asc&tags=&field=status&value=draft')).toBe('?sort=date&status=draft');
});

it('drops empty and idle parameters without a form submission', () => {
	const c = (s: string) => canonicalQuery(new URLSearchParams(s));
	// A folder without fields submits only the sort and order selects.
	expect(c('sort=&order=asc')).toBe('');
	expect(c('sort=&order=desc')).toBe('');
	expect(c('order=desc&status=draft')).toBe('?status=draft');
	expect(c('sort=date&order=asc')).toBe('?sort=date');
	expect(c('status=')).toBe('');
	expect(c('sort=date&order=desc&status=draft')).toBeNull();
	expect(c('')).toBeNull();
	expect(c('/create')).toBeNull();
});

it('queryString round trips', () => {
	const s = queryString({ sort: 'date', order: 'desc', filters: [['tags', 'q 3']] });
	expect(s).toBe('?sort=date&order=desc&tags=q+3');
	expect(queryString({ sort: null, order: 'asc', filters: [] })).toBe('');
	const q = queryFolder(nodes, { 'a.md': { date: ['2026-01-01'], tags: ['q 3'] } }, new URLSearchParams(s));
	expect([q.sort, q.order, q.filters]).toEqual(['date', 'desc', [['tags', 'q 3']]]);
});

it('breaks ties by name whatever the input order', () => {
	const shuffled = [nodes[3], nodes[2], nodes[0], nodes[1]];
	const order = (s: string) => queryFolder(shuffled, fields, new URLSearchParams(s)).nodes.map((n) => n.name);
	expect(order('sort=tags')).toEqual(['sub', 'a.md', 'b.md', 'c.md']);
	expect(order('sort=tags&order=desc')).toEqual(['sub', 'a.md', 'b.md', 'c.md']);
});

it('ignores inherited keys of a document without the field', () => {
	const odd: Record<string, Fields> = { ...fields, 'a.md': { ...fields['a.md'], constructor: ['x'], toString: ['y'] } };
	expect(names('constructor=x', odd)).toEqual(['a']);
	expect(names('toString=y&status=draft', odd)).toEqual(['a']);
	expect(names('sort=constructor&order=desc', odd)).toEqual(['sub', 'a', 'b', 'c']);
	expect(queryFolder(nodes, fields, new URLSearchParams('constructor=x')).filters).toEqual([]);
});
