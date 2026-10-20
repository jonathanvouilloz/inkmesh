import type { TreeNode } from '#lib/core/documents.ts';
import type { Fields } from '#lib/core/markdown.ts';

export type FolderQuery = { sort: string | null; order: 'asc' | 'desc'; filters: Array<[string, string]> };
export type FolderListing = FolderQuery & {
	nodes: TreeNode[];
	fields: string[];
	values: Record<string, string[]>;
	shown: string | null;
	/** Each listed document's values of the sorted field, by path: the only frontmatter a folder page receives. */
	shownValues: Record<string, string>;
	documents: number;
	clear: string;
};

export const RESERVED = ['sort', 'order', 'field', 'value'];
const BUILT_INS = ['title', 'modified'];
const MAX_FILTERS = 5;
const MAX_VALUE = 200;
const MAX_FIELDS = 30;
const MAX_VALUES = 50;

const compare = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }).compare;
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Sorts and filters a folder's entries (in walkTree order) from the URL's query parameters. */
export function queryFolder(nodes: TreeNode[], fields: Record<string, Fields>, params: URLSearchParams): FolderListing {
	const docs = nodes.filter((n) => n.kind === 'doc');
	const of = (n: TreeNode) => fields[n.path] ?? {};
	// Own keys only: a sibling's `constructor` or `toString` key must not reach Object.prototype.
	const get = (n: TreeNode, k: string) => (Object.hasOwn(of(n), k) ? of(n)[k] : undefined);
	const values = new Map<string, Set<string>>();
	for (const d of docs)
		for (const [k, v] of Object.entries(of(d))) {
			const set = values.get(k) ?? values.set(k, new Set()).get(k)!;
			for (const x of v) set.add(x);
		}

	const param = params.get('sort');
	const sort = param && (values.has(param) || BUILT_INS.includes(param)) ? param : null;
	const shown = sort && values.has(sort) ? sort : null;
	const order = sort && params.get('order') === 'desc' ? 'desc' : 'asc';
	const filters: Array<[string, string]> = [];
	for (const [k, v] of params) {
		const value = v.trim().slice(0, MAX_VALUE);
		if (filters.length < MAX_FILTERS && !RESERVED.includes(k) && values.has(k) && value) filters.push([k, value]);
	}

	const key = (n: TreeNode) => (shown ? get(n, shown)?.[0] : sort === 'title' ? n.title : n.modified);
	const sign = order === 'desc' ? -1 : 1;
	let shownDocs = docs.filter((d) => filters.every(([k, v]) => get(d, k)?.some((x) => same(x, v))));
	// Missing values last in both orders; ties by name A to Z in both orders.
	if (sort)
		shownDocs = shownDocs.toSorted((a, b) => {
			const [x, y] = [key(a), key(b)];
			const missing = Number(x === undefined) - Number(y === undefined);
			return missing || (x === undefined || y === undefined ? 0 : sign * compare(x, y)) || compare(a.name, b.name);
		});

	const names = [...values.keys()].sort(compare).slice(0, MAX_FIELDS);
	return {
		sort,
		order,
		filters,
		nodes: [...(filters.length ? [] : nodes.filter((n) => n.kind === 'folder')), ...shownDocs],
		fields: names,
		values: Object.fromEntries(names.map((k) => [k, [...values.get(k)!].sort(compare).slice(0, MAX_VALUES)])),
		shown,
		shownValues: Object.fromEntries(
			shown ? shownDocs.flatMap((d) => (get(d, shown) ? [[d.path, get(d, shown)!.join(', ')]] : [])) : []
		),
		documents: docs.length,
		clear: queryString({ sort, order, filters: [] })
	};
}

/** The search string of a query: `''`, or `?sort=…&order=desc&<field>=<value>…`. */
export function queryString(q: FolderQuery): string {
	const p = new URLSearchParams();
	if (q.sort) p.set('sort', q.sort);
	if (q.order === 'desc') p.set('order', 'desc');
	for (const [k, v] of q.filters) p.append(k, v);
	const s = p.toString();
	return s && `?${s}`;
}

/** The readable URL for a submitted form or a URL with empty or idle parameters, or null when it is readable already. */
export function canonicalQuery(params: URLSearchParams): string | null {
	// `asc` is the default, and without `sort` the list keeps its name order whatever `order` says.
	const sorted = !!params.get('sort');
	// `?/create` is a SvelteKit action name, empty by design: the page's load runs with it after a form POST.
	const idle = (k: string, v: string) => !k.startsWith('/') && (!v || (k === 'order' && (v === 'asc' || !sorted)));
	if (!params.has('field') && !params.has('value') && ![...params].some(([k, v]) => idle(k, v))) return null;
	const field = params.get('field')?.trim() ?? '';
	const value = params.get('value')?.trim() ?? '';
	const add = field && value && !RESERVED.includes(field);
	const p = new URLSearchParams();
	for (const [k, v] of params) {
		if (k === 'field' || k === 'value' || idle(k, v) || (add && k === field)) continue;
		p.append(k, v);
	}
	if (add) p.append(field, value);
	const s = p.toString();
	return s && `?${s}`;
}
