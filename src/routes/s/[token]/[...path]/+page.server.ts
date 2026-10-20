import { error } from '@sveltejs/kit';
import { Forbidden } from '#lib/core/access.ts';
import { titleOf, type TreeNode } from '#lib/core/documents.ts';
import { frontmatterEntries, renderHtml } from '#lib/core/markdown.ts';
import { InvalidPath } from '#lib/core/paths.ts';
import { sharedDocument, sharedTree } from '#lib/core/publicLinks.ts';
import type { PageServerLoad } from './$types';

const notFound = new Set(['ENOENT', 'ENOTDIR', 'EISDIR']);

// Every refusal answers like an unknown path, so a visitor learns nothing outside the link.
async function orNotFound<T>(run: () => Promise<T>): Promise<T> {
	try {
		return await run();
	} catch (err) {
		if (err instanceof Forbidden || err instanceof InvalidPath || notFound.has((err as { code?: string }).code ?? ''))
			error(404);
		throw err;
	}
}

export const load: PageServerLoad = async ({ params, parent }) => {
	await parent(); // an unknown token is a 404 (and counted) before anything is read
	if (params.path.endsWith('.md')) {
		const doc = await orNotFound(() => sharedDocument(params.token, params.path));
		return {
			kind: 'doc' as const,
			docPath: doc.path,
			title: titleOf(doc.body, doc.path.split('/').pop()!),
			// The rendered body shows its own `# ` heading; a document without one gets the title above it.
			heading: !titleOf(doc.body, ''),
			entries: frontmatterEntries(doc.frontmatter),
			html: renderHtml(doc.source)
		};
	}
	// A folder name never ends in .md, so any other path is a folder of the tree.
	let nodes: TreeNode[] | undefined = await orNotFound(() => sharedTree(params.token));
	for (const segment of params.path.split('/'))
		nodes = nodes?.find((n) => n.kind === 'folder' && n.name === segment)?.children;
	if (!nodes) error(404);
	return { kind: 'folder' as const, docPath: params.path, nodes };
};
