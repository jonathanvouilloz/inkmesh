import type { Fields } from '#lib/core/markdown.ts';
import type { FolderListing } from './folderQuery.ts';

/** Each listed document's values of the sorted field: the only frontmatter a folder page receives. */
export function shownValues(query: FolderListing, fields: Record<string, Fields>): Record<string, string> {
	const k = query.shown;
	if (!k) return {};
	return Object.fromEntries(
		query.nodes
			.filter((n) => n.kind === 'doc' && Object.hasOwn(fields[n.path] ?? {}, k))
			.map((n) => [n.path, fields[n.path][k].join(', ')])
	);
}
